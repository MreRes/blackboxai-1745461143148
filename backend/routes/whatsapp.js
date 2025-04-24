const express = require('express');
const router = express.Router();
const WhatsAppUtils = require('../utils/whatsappUtils');
const NLPUtils = require('../utils/nlpUtils');
const ActivationUtils = require('../utils/activationUtils');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const ErrorResponse = require('../utils/errorResponse');
const { 
    protectAdmin, 
    validateWhatsAppSource, 
    validateWhatsAppWebhook,
    whatsAppRateLimit,
    checkPermission 
} = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');

/**
 * @route   GET /api/whatsapp/qr
 * @desc    Get WhatsApp QR code for scanning
 * @access  Private (Admin)
 */
router.get('/qr', [protectAdmin, checkPermission('manage_bot')], asyncHandler(async (req, res) => {
    const qrCode = WhatsAppUtils.getQRCode();
    
    if (!qrCode) {
        throw new ErrorResponse('QR code tidak tersedia. Bot mungkin sudah terhubung.', 404);
    }

    res.json({
        success: true,
        data: {
            qrCode,
            timestamp: new Date().toISOString()
        }
    });
}));

/**
 * @route   GET /api/whatsapp/status
 * @desc    Get WhatsApp bot connection status
 * @access  Private (Admin)
 */
router.get('/status', [protectAdmin, checkPermission('manage_bot')], asyncHandler(async (req, res) => {
    const status = WhatsAppUtils.getStatus();
    
    res.json({
        success: true,
        data: status
    });
}));

/**
 * @route   POST /api/whatsapp/disconnect
 * @desc    Disconnect WhatsApp bot
 * @access  Private (Admin)
 */
router.post('/disconnect', [protectAdmin, checkPermission('manage_bot')], asyncHandler(async (req, res) => {
    await WhatsAppUtils.disconnect();
    
    res.json({
        success: true,
        message: 'Bot WhatsApp berhasil diputuskan'
    });
}));

/**
 * @route   POST /api/whatsapp/initialize
 * @desc    Initialize WhatsApp bot
 * @access  Private (Admin)
 */
router.post('/initialize', [protectAdmin, checkPermission('manage_bot')], asyncHandler(async (req, res) => {
    const callbacks = {
        onQRCode: (qrCode) => {
            console.log('QR Code baru dibuat');
            // Implement WebSocket notification if needed
        },
        onReady: () => {
            console.log('Bot WhatsApp siap');
            // Implement WebSocket notification if needed
        },
        onDisconnected: (reason) => {
            console.log('Bot WhatsApp terputus:', reason);
            // Implement WebSocket notification if needed
        },
        onError: (error) => {
            console.error('Error bot WhatsApp:', error);
            // Implement WebSocket notification if needed
        }
    };

    await WhatsAppUtils.initialize(callbacks);
    
    res.json({
        success: true,
        message: 'Inisialisasi bot WhatsApp dimulai'
    });
}));

/**
 * @route   POST /api/whatsapp/webhook
 * @desc    Handle WhatsApp webhook events
 * @access  Public (with webhook validation)
 */
router.post('/webhook', validateWhatsAppWebhook, asyncHandler(async (req, res) => {
    const { message, from, timestamp } = req.body;

    // Handle different webhook events
    if (message) {
        await handleIncomingMessage(from, message, timestamp);
    }

    res.status(200).send('OK');
}));

/**
 * @route   POST /api/whatsapp/message
 * @desc    Process incoming WhatsApp message
 * @access  Private (WhatsApp Source)
 */
router.post('/message', [validateWhatsAppSource, whatsAppRateLimit], asyncHandler(async (req, res) => {
    const { message, source } = req.body;
    const response = await handleIncomingMessage(source, message);

    res.json({
        success: true,
        data: { response }
    });
}));

/**
 * @route   POST /api/whatsapp/activate
 * @desc    Activate user through WhatsApp
 * @access  Public
 */
router.post('/activate', asyncHandler(async (req, res) => {
    const { phoneNumber, activationCode } = req.body;

    if (!phoneNumber || !activationCode) {
        throw new ErrorResponse('Nomor telepon dan kode aktivasi wajib diisi', 400);
    }

    if (!ActivationUtils.isValidPhoneNumber(phoneNumber)) {
        throw new ErrorResponse('Format nomor telepon tidak valid', 400);
    }

    const formattedPhone = ActivationUtils.formatPhoneNumber(phoneNumber);

    // Find user with this activation code
    const user = await User.findOne({ activationCode });

    if (!user) {
        throw new ErrorResponse('Kode aktivasi tidak valid', 401);
    }

    if (user.isActivationExpired) {
        throw new ErrorResponse('Kode aktivasi telah kadaluarsa', 401);
    }

    const phoneCheck = await user.addPhoneNumber(formattedPhone);
    if (!phoneCheck.allowed) {
        throw new ErrorResponse(phoneCheck.message, 400);
    }

    await user.save();

    // Send welcome message
    const welcomeMessage = `
Selamat datang di Financial Assistant Bot! 🎉

Akun Anda telah berhasil diaktivasi. Berikut panduan singkat penggunaan:

1️⃣ Catat Transaksi:
   • Pengeluaran: "keluar 50rb makan"
   • Pemasukan: "masuk 2jt gaji"

2️⃣ Cek Budget:
   • "budget makan"
   • "sisa budget"

3️⃣ Lihat Laporan:
   • "laporan hari ini"
   • "laporan bulan ini"

4️⃣ Bantuan: ketik "help" atau "bantuan"

Selamat menggunakan! 🚀
`;

    await WhatsAppUtils.sendMessage(formattedPhone, welcomeMessage);

    res.json({
        success: true,
        message: 'Aktivasi berhasil'
    });
}));

// Helper Functions

/**
 * Handle incoming WhatsApp message
 * @param {string} from - Sender's phone number
 * @param {string} message - Message content
 * @param {number} timestamp - Message timestamp
 */
async function handleIncomingMessage(from, message, timestamp = Date.now()) {
    try {
        // Find user by phone number
        const user = await User.findOne({
            phoneNumbers: from,
            isActive: true
        });

        if (!user) {
            return 'Nomor Anda belum terdaftar. Silakan aktivasi terlebih dahulu dengan format: "aktivasi KODE_AKTIVASI"';
        }

        if (user.isActivationExpired) {
            return 'Masa aktif Anda telah berakhir. Silakan hubungi admin untuk perpanjangan.';
        }

        // Process message with NLP
        const processed = await NLPUtils.processMessage(message);

        // Handle different intents
        let response;
        switch (processed.intent) {
            case 'transaction.expense':
            case 'transaction.income':
                response = await handleTransactionIntent(user, processed);
                break;

            case 'transaction.delete':
                response = await handleTransactionDelete(user);
                break;

            case 'transaction.edit':
                response = await handleTransactionEdit(user, processed);
                break;

            case 'budget.check':
            case 'budget.list':
                response = await handleBudgetCheck(user, processed);
                break;

            case 'budget.set':
                response = await handleBudgetSet(user, processed);
                break;

            case 'report.daily':
            case 'report.weekly':
            case 'report.monthly':
            case 'report.yearly':
                response = await handleReport(user, processed);
                break;

            case 'report.analysis':
                response = await handleAnalysis(user, processed);
                break;

            case 'help.general':
                response = getHelpMessage();
                break;

            default:
                response = 'Maaf, saya tidak mengerti pesan Anda. Ketik "help" untuk bantuan.';
        }

        return response;
    } catch (error) {
        console.error('Error handling message:', error);
        return 'Maaf, terjadi kesalahan. Silakan coba lagi.';
    }
}

/**
 * Handle transaction intent
 */
async function handleTransactionIntent(user, processed) {
    const { intent, entities } = processed;
    const type = intent.includes('expense') ? 'expense' : 'income';
    
    try {
        const transaction = await Transaction.create({
            userId: user._id,
            type,
            amount: parseFloat(entities.amount),
            category: entities.category,
            description: entities.description || `${type} via WhatsApp`,
            source: 'whatsapp',
            date: new Date()
        });

        // Check budget if it's an expense
        let budgetWarning = '';
        if (type === 'expense') {
            const budget = await Budget.findOne({
                userId: user._id,
                category: entities.category
            });

            if (budget) {
                const totalExpenses = await Transaction.getTotalByCategory(
                    user._id,
                    entities.category,
                    new Date().setDate(1), // Start of month
                    new Date() // Current date
                );

                if (totalExpenses > budget.amount) {
                    budgetWarning = `\n\n⚠️ Peringatan: Pengeluaran untuk ${entities.category} telah melebihi budget!`;
                } else if (totalExpenses > budget.amount * 0.8) {
                    budgetWarning = `\n\n⚠️ Peringatan: Pengeluaran untuk ${entities.category} sudah mencapai ${Math.round((totalExpenses/budget.amount)*100)}% dari budget!`;
                }
            }
        }

        return `✅ ${type === 'expense' ? 'Pengeluaran' : 'Pemasukan'} sebesar ${formatCurrency(entities.amount)} untuk ${entities.category} berhasil dicatat.${budgetWarning}`;
    } catch (error) {
        throw new ErrorResponse('Gagal mencatat transaksi', 500);
    }
}

/**
 * Handle budget check
 */
async function handleBudgetCheck(user, processed) {
    const { intent, entities } = processed;
    
    try {
        if (intent === 'budget.list') {
            const budgets = await Budget.find({ userId: user._id });
            if (budgets.length === 0) {
                return 'Belum ada budget yang diatur.';
            }

            const budgetList = await Promise.all(budgets.map(async (budget) => {
                const spent = await Transaction.getTotalByCategory(
                    user._id,
                    budget.category,
                    new Date().setDate(1),
                    new Date()
                );
                const remaining = budget.amount - spent;
                return `${budget.category}: ${formatCurrency(budget.amount)}\nTerpakai: ${formatCurrency(spent)}\nSisa: ${formatCurrency(remaining)}`;
            }));

            return `📊 Daftar Budget:\n\n${budgetList.join('\n\n')}`;
        }

        const budget = await Budget.findOne({
            userId: user._id,
            category: entities.category
        });

        if (!budget) {
            return `Belum ada budget untuk kategori ${entities.category}.`;
        }

        const spent = await Transaction.getTotalByCategory(
            user._id,
            entities.category,
            new Date().setDate(1),
            new Date()
        );

        const remaining = budget.amount - spent;
        const percentage = Math.round((spent/budget.amount)*100);

        return `📊 Budget ${entities.category}:\nTotal: ${formatCurrency(budget.amount)}\nTerpakai: ${formatCurrency(spent)} (${percentage}%)\nSisa: ${formatCurrency(remaining)}`;
    } catch (error) {
        throw new ErrorResponse('Gagal memeriksa budget', 500);
    }
}

/**
 * Handle report generation
 */
async function handleReport(user, processed) {
    const { intent } = processed;
    let startDate, endDate;
    
    switch (intent) {
        case 'report.daily':
            startDate = new Date();
            startDate.setHours(0,0,0,0);
            endDate = new Date();
            endDate.setHours(23,59,59,999);
            break;
        case 'report.weekly':
            startDate = new Date();
            startDate.setDate(startDate.getDate() - startDate.getDay());
            endDate = new Date();
            break;
        case 'report.monthly':
            startDate = new Date();
            startDate.setDate(1);
            endDate = new Date();
            break;
        case 'report.yearly':
            startDate = new Date();
            startDate.setMonth(0, 1);
            endDate = new Date();
            break;
    }

    try {
        const transactions = await Transaction.aggregate([
            {
                $match: {
                    userId: user._id,
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: {
                        type: '$type',
                        category: '$category'
                    },
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.type',
                    categories: {
                        $push: {
                            name: '$_id.category',
                            total: '$total',
                            count: '$count'
                        }
                    },
                    total: { $sum: '$total' }
                }
            }
        ]);

        const income = transactions.find(t => t._id === 'income') || { total: 0, categories: [] };
        const expense = transactions.find(t => t._id === 'expense') || { total: 0, categories: [] };
        const balance = income.total - expense.total;

        let reportType;
        switch (intent) {
            case 'report.daily': reportType = 'Hari Ini'; break;
            case 'report.weekly': reportType = 'Minggu Ini'; break;
            case 'report.monthly': reportType = 'Bulan Ini'; break;
            case 'report.yearly': reportType = 'Tahun Ini'; break;
        }

        let report = `📊 Laporan ${reportType}\n\n`;
        report += `💰 Total Pemasukan: ${formatCurrency(income.total)}\n`;
        report += `💸 Total Pengeluaran: ${formatCurrency(expense.total)}\n`;
        report += `${balance >= 0 ? '✅' : '❌'} Selisih: ${formatCurrency(balance)}\n\n`;

        if (expense.categories.length > 0) {
            report += '📈 Detail Pengeluaran:\n';
            expense.categories
                .sort((a, b) => b.total - a.total)
                .forEach(cat => {
                    report += `${cat.name}: ${formatCurrency(cat.total)}\n`;
                });
        }

        return report;
    } catch (error) {
        throw new ErrorResponse('Gagal menghasilkan laporan', 500);
    }
}

/**
 * Format currency
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

/**
 * Get help message
 */
function getHelpMessage() {
    return `🤖 Panduan Penggunaan Bot

1️⃣ Catat Transaksi:
   • Pengeluaran: "keluar 50rb makan"
   • Pemasukan: "masuk 2jt gaji"
   • Hapus: "hapus transaksi terakhir"

2️⃣ Cek Budget:
   • "budget makan"
   • "sisa budget"
   • "atur budget makan 1jt"

3️⃣ Lihat Laporan:
   • "laporan hari ini"
   • "laporan minggu ini"
   • "laporan bulan ini"
   • "laporan tahun ini"

4️⃣ Contoh Format Jumlah:
   • 50rb = 50.000
   • 1,5jt = 1.500.000
   • 100k = 100.000

❓ Butuh bantuan lebih lanjut?
Hubungi admin kami di:
wa.me/+6281234567890`;
}

module.exports = router;
