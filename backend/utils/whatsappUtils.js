const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');
const ErrorResponse = require('./errorResponse');
const nlpUtils = require('./nlpUtils');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');

class WhatsAppUtils {
    constructor() {
        this.client = null;
        this.qrCode = null;
        this.sessionPath = process.env.BOT_SESSION_PATH;
        this.isConnected = false;
        this.connectionCallbacks = {
            onQRCode: null,
            onReady: null,
            onDisconnected: null,
            onError: null
        };
    }

    /**
     * Initialize WhatsApp client
     * @param {Object} callbacks - Callback functions for different events
     * @returns {Promise<void>}
     */
    async initialize(callbacks = {}) {
        try {
            // Update callbacks
            this.connectionCallbacks = { ...this.connectionCallbacks, ...callbacks };

            // Initialize client with headless mode
            this.client = new Client({
                puppeteer: {
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--disable-gpu'
                    ]
                },
                qrTimeoutMs: 0,
                authTimeoutMs: 0
            });

            // Set up event handlers
            this.setupEventHandlers();

            // Try to restore session
            await this.restoreSession();

            // Initialize the client
            await this.client.initialize();
        } catch (error) {
            throw new ErrorResponse('Failed to initialize WhatsApp client', 500, error);
        }
    }

    /**
     * Set up WhatsApp client event handlers
     */
    setupEventHandlers() {
        // QR code event
        this.client.on('qr', async (qr) => {
            try {
                this.qrCode = await qrcode.toDataURL(qr);
                const qrPath = path.join(__dirname, '../temp/qr.png');
                await qrcode.toFile(qrPath, qr);

                if (this.connectionCallbacks.onQRCode) {
                    this.connectionCallbacks.onQRCode(this.qrCode);
                }
            } catch (error) {
                console.error('QR Code generation error:', error);
            }
        });

        // Ready event
        this.client.on('ready', () => {
            this.isConnected = true;
            if (this.connectionCallbacks.onReady) {
                this.connectionCallbacks.onReady();
            }
        });

        // Message event
        this.client.on('message', async (message) => {
            try {
                await this.handleIncomingMessage(message);
            } catch (error) {
                console.error('Message handling error:', error);
                // Send error message back to user
                message.reply('Maaf, terjadi kesalahan dalam memproses pesan Anda. Silakan coba lagi.');
            }
        });

        // Authenticated event
        this.client.on('authenticated', async (session) => {
            try {
                await this.saveSession(session);
            } catch (error) {
                console.error('Session save error:', error);
            }
        });

        // Disconnected event
        this.client.on('disconnected', (reason) => {
            this.isConnected = false;
            if (this.connectionCallbacks.onDisconnected) {
                this.connectionCallbacks.onDisconnected(reason);
            }
        });

        // Error event
        this.client.on('error', (error) => {
            if (this.connectionCallbacks.onError) {
                this.connectionCallbacks.onError(error);
            }
        });
    }

    /**
     * Handle incoming WhatsApp message
     * @param {Object} message - WhatsApp message object
     * @returns {Promise<void>}
     */
    async handleIncomingMessage(message) {
        try {
            // Get user from phone number
            const phoneNumber = message.from.replace('@c.us', '');
            const user = await User.findOne({ phoneNumber });

            // Check if user exists and is active
            if (!user || !user.isActive) {
                // Check if message is activation attempt
                if (message.body.toLowerCase().includes('aktivasi')) {
                    await this.handleActivation(message);
                    return;
                }
                
                message.reply('Maaf, nomor Anda belum terdaftar atau tidak aktif. Silakan aktivasi terlebih dahulu.');
                return;
            }

            // Process message with NLP
            const processed = await nlpUtils.processMessage(message.body);
            
            // Handle based on intent
            let response;
            switch (processed.intent) {
                case 'transaction.expense':
                case 'transaction.income':
                    response = await this.handleTransaction(user, processed);
                    break;
                    
                case 'transaction.delete':
                    response = await this.handleTransactionDelete(user);
                    break;
                    
                case 'transaction.edit':
                    response = await this.handleTransactionEdit(user, message);
                    break;
                    
                case 'budget.set':
                    response = await this.handleBudgetSet(user, processed);
                    break;
                    
                case 'budget.check':
                    response = await this.handleBudgetCheck(user, processed);
                    break;
                    
                case 'budget.list':
                    response = await this.handleBudgetList(user);
                    break;
                    
                case 'report.daily':
                case 'report.weekly':
                case 'report.monthly':
                case 'report.yearly':
                    response = await this.handleReport(user, processed);
                    break;
                    
                case 'report.analysis':
                    response = await this.handleAnalysis(user);
                    break;
                    
                case 'help.general':
                    response = nlpUtils.getResponse(processed);
                    break;
                    
                case 'activation.check':
                    response = await this.handleActivationCheck(user);
                    break;
                    
                default:
                    response = 'Maaf, saya tidak mengerti pesan Anda. Ketik "help" untuk bantuan.';
            }

            // Send response
            await message.reply(response);
        } catch (error) {
            throw new ErrorResponse('Failed to handle message', 500, error);
        }
    }

    /**
     * Handle transaction creation
     * @param {Object} user - User object
     * @param {Object} processed - Processed NLP result
     * @returns {Promise<string>} Response message
     */
    async handleTransaction(user, processed) {
        try {
            const { intent, entities } = processed;
            const type = intent === 'transaction.expense' ? 'expense' : 'income';
            
            // Create transaction
            const transaction = await Transaction.create({
                userId: user._id,
                type,
                amount: parseFloat(entities.amount),
                category: entities.category,
                description: entities.description || `${type} via WhatsApp`,
                source: 'whatsapp'
            });

            return nlpUtils.getResponse(processed);
        } catch (error) {
            throw new ErrorResponse('Failed to create transaction', 500, error);
        }
    }

    /**
     * Handle transaction deletion
     * @param {Object} user - User object
     * @returns {Promise<string>} Response message
     */
    async handleTransactionDelete(user) {
        try {
            const lastTransaction = await Transaction.findOne({ 
                userId: user._id 
            }).sort({ createdAt: -1 });

            if (!lastTransaction) {
                return 'Tidak ada transaksi yang dapat dihapus.';
            }

            await lastTransaction.remove();
            return 'Transaksi terakhir berhasil dihapus.';
        } catch (error) {
            throw new ErrorResponse('Failed to delete transaction', 500, error);
        }
    }

    /**
     * Handle budget setting
     * @param {Object} user - User object
     * @param {Object} processed - Processed NLP result
     * @returns {Promise<string>} Response message
     */
    async handleBudgetSet(user, processed) {
        try {
            const { entities } = processed;
            
            // Update or create budget
            await Budget.findOneAndUpdate(
                { 
                    userId: user._id,
                    category: entities.category
                },
                {
                    amount: parseFloat(entities.amount),
                    startDate: new Date().setHours(0,0,0,0),
                    endDate: new Date(new Date().setMonth(new Date().getMonth() + 1))
                },
                { upsert: true }
            );

            return nlpUtils.getResponse(processed);
        } catch (error) {
            throw new ErrorResponse('Failed to set budget', 500, error);
        }
    }

    /**
     * Handle budget check
     * @param {Object} user - User object
     * @param {Object} processed - Processed NLP result
     * @returns {Promise<string>} Response message
     */
    async handleBudgetCheck(user, processed) {
        try {
            const { entities } = processed;
            const budget = await Budget.findOne({
                userId: user._id,
                category: entities.category
            });

            if (!budget) {
                return `Belum ada budget untuk kategori ${entities.category}`;
            }

            // Get total expenses for this category this month
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0,0,0,0);

            const expenses = await Transaction.aggregate([
                {
                    $match: {
                        userId: user._id,
                        category: entities.category,
                        type: 'expense',
                        date: { $gte: startOfMonth }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$amount' }
                    }
                }
            ]);

            const spent = expenses[0]?.total || 0;
            const remaining = budget.amount - spent;

            return `Budget ${entities.category}:\nTotal: Rp${budget.amount.toLocaleString()}\nTerpakai: Rp${spent.toLocaleString()}\nSisa: Rp${remaining.toLocaleString()}`;
        } catch (error) {
            throw new ErrorResponse('Failed to check budget', 500, error);
        }
    }

    /**
     * Handle report generation
     * @param {Object} user - User object
     * @param {Object} processed - Processed NLP result
     * @returns {Promise<string>} Response message
     */
    async handleReport(user, processed) {
        try {
            const { intent } = processed;
            let startDate, endDate;
            
            // Set date range based on intent
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
                    startDate.setHours(0,0,0,0);
                    endDate = new Date();
                    break;
                    
                case 'report.monthly':
                    startDate = new Date();
                    startDate.setDate(1);
                    startDate.setHours(0,0,0,0);
                    endDate = new Date();
                    break;
                    
                case 'report.yearly':
                    startDate = new Date();
                    startDate.setMonth(0, 1);
                    startDate.setHours(0,0,0,0);
                    endDate = new Date();
                    break;
            }

            // Get transactions summary
            const summary = await Transaction.aggregate([
                {
                    $match: {
                        userId: user._id,
                        date: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: '$type',
                        total: { $sum: '$amount' },
                        count: { $sum: 1 }
                    }
                }
            ]);

            // Format response
            const income = summary.find(s => s._id === 'income')?.total || 0;
            const expense = summary.find(s => s._id === 'expense')?.total || 0;
            const balance = income - expense;

            return `Laporan ${intent.split('.')[1]}:\n\nPemasukan: Rp${income.toLocaleString()}\nPengeluaran: Rp${expense.toLocaleString()}\nSelisih: Rp${balance.toLocaleString()}`;
        } catch (error) {
            throw new ErrorResponse('Failed to generate report', 500, error);
        }
    }

    /**
     * Handle activation check
     * @param {Object} user - User object
     * @returns {Promise<string>} Response message
     */
    async handleActivationCheck(user) {
        try {
            const now = new Date();
            const remaining = user.activationExpiry - now;
            const days = Math.ceil(remaining / (1000 * 60 * 60 * 24));
            
            return `Status aktivasi: ${user.isActive ? 'Aktif' : 'Tidak aktif'}\nBerlaku hingga: ${user.activationExpiry.toLocaleDateString()}\nSisa: ${days} hari`;
        } catch (error) {
            throw new ErrorResponse('Failed to check activation', 500, error);
        }
    }

    /**
     * Handle activation attempt
     * @param {Object} message - WhatsApp message object
     * @returns {Promise<void>}
     */
    async handleActivation(message) {
        try {
            const processed = await nlpUtils.processMessage(message.body);
            const activationCode = processed.entities.code;

            if (!activationCode) {
                message.reply('Format aktivasi tidak valid. Gunakan: "aktivasi KODE_AKTIVASI"');
                return;
            }

            const phoneNumber = message.from.replace('@c.us', '');
            
            // Find user with matching activation code
            const user = await User.findOne({ 
                activationCode,
                'phoneNumbers': { $ne: phoneNumber }
            });

            if (!user) {
                message.reply('Kode aktivasi tidak valid atau sudah digunakan.');
                return;
            }

            // Check if user has reached phone number limit
            if (user.phoneNumbers.length >= user.phoneNumberLimit) {
                message.reply('Batas maksimum nomor telepon untuk akun ini telah tercapai.');
                return;
            }

            // Add phone number to user
            user.phoneNumbers.push(phoneNumber);
            await user.save();

            message.reply('Aktivasi berhasil! Selamat menggunakan layanan Financial Assistant Bot.');
        } catch (error) {
            throw new ErrorResponse('Failed to handle activation', 500, error);
        }
    }

    // ... (keep existing session management and utility methods)
}

// Export singleton instance
module.exports = new WhatsAppUtils();
