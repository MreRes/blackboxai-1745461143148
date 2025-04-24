const { NlpManager } = require('node-nlp');
const ErrorResponse = require('./errorResponse');

class NLPUtils {
    constructor() {
        this.manager = new NlpManager({ 
            languages: ['id'],
            forceNER: true,
            modelFileName: 'nlp-model.json',
            // Enhanced settings for better language processing
            nlu: { 
                useNoneFeature: true,
                log: false
            }
        });
        this.initialized = false;
    }

    /**
     * Initialize NLP manager with training data
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Add documents for transaction intents
            this.addTransactionDocuments();
            
            // Add documents for budget intents
            this.addBudgetDocuments();
            
            // Add documents for report intents
            this.addReportDocuments();
            
            // Add documents for help and activation intents
            this.addHelpAndActivationDocuments();

            // Train the model
            await this.manager.train();
            this.initialized = true;
        } catch (error) {
            throw new ErrorResponse('Failed to initialize NLP manager', 500, error);
        }
    }

    /**
     * Add transaction-related training documents
     */
    addTransactionDocuments() {
        // Formal language
        this.manager.addDocument('id', 'catat pengeluaran {amount} untuk {category}', 'transaction.expense');
        this.manager.addDocument('id', 'tambah pengeluaran {amount} {category}', 'transaction.expense');
        this.manager.addDocument('id', 'mencatat pemasukan {amount} dari {source}', 'transaction.income');
        this.manager.addDocument('id', 'tambah pemasukan {amount} {source}', 'transaction.income');
        this.manager.addDocument('id', 'saya mengeluarkan uang {amount} untuk {category}', 'transaction.expense');
        this.manager.addDocument('id', 'saya menerima uang {amount} dari {source}', 'transaction.income');

        // Informal language
        this.manager.addDocument('id', 'keluar duit {amount} buat {category}', 'transaction.expense');
        this.manager.addDocument('id', 'abis {amount} untuk {category}', 'transaction.expense');
        this.manager.addDocument('id', 'masuk duit {amount} dari {source}', 'transaction.income');
        this.manager.addDocument('id', 'dapet duit {amount} dari {source}', 'transaction.income');
        this.manager.addDocument('id', 'bayar {category} {amount}', 'transaction.expense');
        this.manager.addDocument('id', 'beli {category} {amount}', 'transaction.expense');

        // Slang and common variations
        this.manager.addDocument('id', 'kepake {amount} buat {category}', 'transaction.expense');
        this.manager.addDocument('id', 'bokek {amount} gara2 {category}', 'transaction.expense');
        this.manager.addDocument('id', 'cuan {amount} dari {source}', 'transaction.income');
        this.manager.addDocument('id', 'dapet cuan {amount} {source}', 'transaction.income');
        this.manager.addDocument('id', 'keluar {amount} {category}', 'transaction.expense');
        this.manager.addDocument('id', 'masuk {amount} {source}', 'transaction.income');
        this.manager.addDocument('id', '-{amount} {category}', 'transaction.expense');
        this.manager.addDocument('id', '+{amount} {source}', 'transaction.income');

        // Delete transactions
        this.manager.addDocument('id', 'hapus transaksi terakhir', 'transaction.delete');
        this.manager.addDocument('id', 'batalkan transaksi sebelumnya', 'transaction.delete');
        this.manager.addDocument('id', 'delete transaksi barusan', 'transaction.delete');
        this.manager.addDocument('id', 'hapus catatan terakhir', 'transaction.delete');

        // Edit transactions
        this.manager.addDocument('id', 'ubah transaksi terakhir', 'transaction.edit');
        this.manager.addDocument('id', 'edit transaksi sebelumnya', 'transaction.edit');
        this.manager.addDocument('id', 'koreksi transaksi barusan', 'transaction.edit');
        this.manager.addDocument('id', 'ganti catatan terakhir', 'transaction.edit');
    }

    /**
     * Add budget-related training documents
     */
    addBudgetDocuments() {
        // Formal language
        this.manager.addDocument('id', 'atur budget {category} {amount}', 'budget.set');
        this.manager.addDocument('id', 'tetapkan anggaran {category} {amount}', 'budget.set');
        this.manager.addDocument('id', 'lihat budget {category}', 'budget.check');
        this.manager.addDocument('id', 'cek anggaran {category}', 'budget.check');
        this.manager.addDocument('id', 'berapa sisa anggaran {category}', 'budget.check');
        this.manager.addDocument('id', 'tampilkan semua budget', 'budget.list');

        // Informal language
        this.manager.addDocument('id', 'set budget {category} {amount}', 'budget.set');
        this.manager.addDocument('id', 'mau budget {category} {amount}', 'budget.set');
        this.manager.addDocument('id', 'liat budget {category}', 'budget.check');
        this.manager.addDocument('id', 'sisa budget {category}', 'budget.check');
        this.manager.addDocument('id', 'budget {category} berapa', 'budget.check');
        this.manager.addDocument('id', 'liat semua budget', 'budget.list');

        // Slang
        this.manager.addDocument('id', 'budget {category} brp?', 'budget.check');
        this.manager.addDocument('id', 'masi brp budget {category}', 'budget.check');
        this.manager.addDocument('id', 'sisain {amount} buat {category}', 'budget.set');
        this.manager.addDocument('id', 'list budget', 'budget.list');
        this.manager.addDocument('id', 'budget gw brp?', 'budget.list');
    }

    /**
     * Add report-related training documents
     */
    addReportDocuments() {
        // Formal language
        this.manager.addDocument('id', 'laporan keuangan bulan ini', 'report.monthly');
        this.manager.addDocument('id', 'lihat laporan bulanan', 'report.monthly');
        this.manager.addDocument('id', 'laporan pengeluaran hari ini', 'report.daily');
        this.manager.addDocument('id', 'laporan pemasukan minggu ini', 'report.weekly');
        this.manager.addDocument('id', 'ringkasan keuangan tahun ini', 'report.yearly');
        this.manager.addDocument('id', 'analisis pengeluaran', 'report.analysis');

        // Informal language
        this.manager.addDocument('id', 'liat laporan bulan ini', 'report.monthly');
        this.manager.addDocument('id', 'cek laporan hari ini', 'report.daily');
        this.manager.addDocument('id', 'ringkasan minggu ini', 'report.weekly');
        this.manager.addDocument('id', 'gimana keuangan gw bulan ini', 'report.monthly');
        this.manager.addDocument('id', 'pengeluaran terbesar', 'report.analysis');

        // Slang
        this.manager.addDocument('id', 'recap bulan ini dong', 'report.monthly');
        this.manager.addDocument('id', 'rangkuman hari ini', 'report.daily');
        this.manager.addDocument('id', 'ringkasan mingguan dong', 'report.weekly');
        this.manager.addDocument('id', 'abis brp bulan ini', 'report.monthly');
        this.manager.addDocument('id', 'dapet brp minggu ini', 'report.weekly');
        this.manager.addDocument('id', 'total pengeluaran', 'report.analysis');
    }

    /**
     * Add help and activation-related training documents
     */
    addHelpAndActivationDocuments() {
        // Help documents
        this.manager.addDocument('id', 'cara menggunakan bot', 'help.general');
        this.manager.addDocument('id', 'bantuan penggunaan', 'help.general');
        this.manager.addDocument('id', 'panduan pengguna', 'help.general');
        this.manager.addDocument('id', 'gimana cara pakenya', 'help.general');
        this.manager.addDocument('id', 'cara make bot', 'help.general');
        this.manager.addDocument('id', 'butuh bantuan', 'help.general');
        this.manager.addDocument('id', 'help dong', 'help.general');
        this.manager.addDocument('id', 'bingung nih', 'help.general');
        this.manager.addDocument('id', 'tutorial dong', 'help.general');

        // Activation documents
        this.manager.addDocument('id', 'aktivasi {code}', 'activation.activate');
        this.manager.addDocument('id', 'daftar dengan kode {code}', 'activation.activate');
        this.manager.addDocument('id', 'registrasi {code}', 'activation.activate');
        this.manager.addDocument('id', 'pake kode {code}', 'activation.activate');
        this.manager.addDocument('id', 'masukkan kode {code}', 'activation.activate');
        this.manager.addDocument('id', 'cek masa aktif', 'activation.check');
        this.manager.addDocument('id', 'berapa lama lagi aktif', 'activation.check');
        this.manager.addDocument('id', 'kapan expired', 'activation.check');
    }

    /**
     * Add amount entities
     */
    addAmountEntities() {
        // Regular amounts with variations
        const amounts = {
            '1000': ['1rb', '1ribu', '1k', '1.000', 'seribu'],
            '2000': ['2rb', '2ribu', '2k', '2.000', 'dua ribu'],
            '5000': ['5rb', '5ribu', '5k', '5.000', 'lima ribu'],
            '10000': ['10rb', '10ribu', '10k', '10.000', 'sepuluh ribu'],
            '20000': ['20rb', '20ribu', '20k', '20.000', 'dua puluh ribu'],
            '50000': ['50rb', '50ribu', '50k', '50.000', 'lima puluh ribu'],
            '100000': ['100rb', '100ribu', '100k', '100.000', 'seratus ribu'],
            '500000': ['500rb', '500ribu', '500k', '500.000', 'lima ratus ribu'],
            '1000000': ['1jt', '1juta', '1m', '1.000.000', 'satu juta'],
            '2000000': ['2jt', '2juta', '2m', '2.000.000', 'dua juta'],
            '5000000': ['5jt', '5juta', '5m', '5.000.000', 'lima juta'],
            '10000000': ['10jt', '10juta', '10m', '10.000.000', 'sepuluh juta']
        };

        Object.entries(amounts).forEach(([amount, variations]) => {
            this.manager.addNamedEntityText('amount', amount, ['id'], variations);
        });
    }

    /**
     * Add category entities
     */
    addCategoryEntities() {
        const categories = {
            'makanan': ['makan', 'food', 'kuliner', 'jajan', 'snack', 'minum', 'resto', 'restaurant'],
            'transportasi': ['transport', 'bensin', 'parkir', 'toll', 'tol', 'grab', 'gojek', 'taksi', 'taxi', 'bus', 'kereta', 'train'],
            'belanja': ['shopping', 'beli', 'shop', 'mall', 'toko', 'store', 'market', 'pasar'],
            'utilitas': ['listrik', 'air', 'pam', 'internet', 'wifi', 'pulsa', 'token', 'gas'],
            'hiburan': ['entertainment', 'movie', 'film', 'bioskop', 'game', 'musik', 'music', 'concert', 'konser'],
            'kesehatan': ['health', 'dokter', 'doctor', 'obat', 'medicine', 'rumah sakit', 'hospital', 'medical'],
            'pendidikan': ['education', 'sekolah', 'school', 'kursus', 'course', 'buku', 'book', 'kuliah'],
            'olahraga': ['sport', 'gym', 'fitness', 'renang', 'swim', 'futsal', 'basket', 'tennis']
        };

        Object.entries(categories).forEach(([category, variations]) => {
            this.manager.addNamedEntityText('category', category, ['id'], variations);
        });
    }

    /**
     * Add source entities
     */
    addSourceEntities() {
        const sources = {
            'gaji': ['salary', 'payroll', 'upah', 'wage', 'pendapatan', 'income'],
            'bonus': ['thr', 'insentif', 'reward', 'komisi', 'commission'],
            'investasi': ['investment', 'saham', 'stocks', 'reksadana', 'mutual fund', 'deposito', 'deposit'],
            'bisnis': ['business', 'usaha', 'dagang', 'jualan', 'toko', 'store'],
            'freelance': ['project', 'proyek', 'kerja lepas', 'part time', 'side job'],
            'hadiah': ['gift', 'kado', 'present', 'prize', 'reward'],
            'pinjaman': ['loan', 'hutang', 'debt', 'kredit', 'credit'],
            'lainnya': ['other', 'dll', 'etc', 'dan lain', 'miscellaneous']
        };

        Object.entries(sources).forEach(([source, variations]) => {
            this.manager.addNamedEntityText('source', source, ['id'], variations);
        });
    }

    /**
     * Process a message and extract intent and entities
     * @param {string} message - Message to process
     * @returns {Promise<Object>} Processed result with intent and entities
     */
    async processMessage(message) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            // Clean and normalize message
            const cleanedMessage = this.cleanMessage(message);
            const result = await this.manager.process('id', cleanedMessage);

            // Extract relevant information
            const processed = {
                intent: result.intent,
                score: result.score,
                entities: {},
                original: message,
                cleaned: cleanedMessage
            };

            // Map entities to a more usable format
            result.entities.forEach(entity => {
                processed.entities[entity.entity] = entity.resolution?.value || entity.utteranceText;
            });

            // Add sentiment analysis
            processed.sentiment = result.sentiment;

            return processed;
        } catch (error) {
            throw new ErrorResponse('Failed to process message', 500, error);
        }
    }

    /**
     * Clean and normalize message text
     * @param {string} message - Message to clean
     * @returns {string} Cleaned message
     */
    cleanMessage(message) {
        return message
            .toLowerCase()
            // Replace common abbreviations
            .replace(/tdk/g, 'tidak')
            .replace(/tdk/g, 'tidak')
            .replace(/utk/g, 'untuk')
            .replace(/dgn/g, 'dengan')
            .replace(/yg/g, 'yang')
            .replace(/sy/g, 'saya')
            .replace(/gw/g, 'saya')
            .replace(/gue/g, 'saya')
            .replace(/aq/g, 'saya')
            .replace(/brp/g, 'berapa')
            .replace(/bln/g, 'bulan')
            .replace(/thn/g, 'tahun')
            // Clean special characters but keep basic punctuation
            .replace(/[^\w\s.,?!-]/g, ' ')
            // Normalize whitespace
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Get response based on intent and entities
     * @param {Object} processed - Processed message data
     * @returns {string} Response message
     */
    getResponse(processed) {
        const { intent, entities, sentiment } = processed;

        // Default responses with variations
        const responses = {
            'transaction.expense': [
                'Ok, saya catat pengeluaran sebesar {amount} untuk {category}',
                'Baik, pengeluaran {amount} untuk {category} sudah dicatat',
                'Pengeluaran {amount} untuk {category} berhasil ditambahkan'
            ],
            'transaction.income': [
                'Ok, saya catat pemasukan sebesar {amount} dari {source}',
                'Baik, pemasukan {amount} dari {source} sudah dicatat',
                'Pemasukan {amount} dari {source} berhasil ditambahkan'
            ],
            'transaction.delete': [
                'Transaksi terakhir sudah dihapus',
                'Ok, catatan terakhir sudah dihapus',
                'Berhasil menghapus transaksi sebelumnya'
            ],
            'transaction.edit': [
                'Silakan kirim detail perubahan transaksi',
                'Baik, apa perubahan yang diinginkan?',
                'Ok, mohon kirim data yang ingin diubah'
            ],
            'budget.set': [
                'Budget untuk {category} sudah diatur sebesar {amount}',
                'Ok, anggaran {category} diset menjadi {amount}',
                'Berhasil mengatur budget {category} sebesar {amount}'
            ],
            'budget.check': [
                'Budget {category} yang tersisa adalah {amount}',
                'Sisa anggaran untuk {category}: {amount}',
                'Untuk {category}, tersisa budget sebesar {amount}'
            ],
            'budget.list': [
                'Berikut daftar budget Anda:',
                'Ini ringkasan budget yang tersedia:',
                'Daftar anggaran Anda:'
            ],
            'report.monthly': [
                'Berikut laporan keuangan bulan ini...',
                'Ini ringkasan transaksi bulan ini...',
                'Laporan bulanan Anda:'
            ],
            'report.daily': [
                'Berikut laporan keuangan hari ini...',
                'Ini ringkasan transaksi hari ini...',
                'Laporan harian Anda:'
            ],
            'report.weekly': [
                'Berikut laporan keuangan minggu ini...',
                'Ini ringkasan transaksi minggu ini...',
                'Laporan mingguan Anda:'
            ],
            'report.yearly': [
                'Berikut laporan keuangan tahun ini...',
                'Ini ringkasan transaksi tahun ini...',
                'Laporan tahunan Anda:'
            ],
            'report.analysis': [
                'Berikut analisis keuangan Anda...',
                'Ini hasil analisis transaksi Anda...',
                'Analisis pengeluaran Anda:'
            ],
            'help.general': [
                'Berikut panduan penggunaan bot:\n1. Catat transaksi: "catat pengeluaran 50rb untuk makan"\n2. Cek budget: "lihat budget makanan"\n3. Lihat laporan: "laporan bulanan"',
                'Cara menggunakan bot:\n1. Input transaksi: "+100rb gaji" atau "-50rb makan"\n2. Cek saldo: "sisa budget"\n3. Lihat laporan: "recap bulan ini"',
                'Tutorial bot:\n1. Catat uang masuk: "masuk 1jt gaji"\n2. Catat uang keluar: "keluar 50rb makan"\n3. Lihat laporan: "laporan harian"'
            ],
            'activation.activate': [
                'Kode aktivasi {code} sedang diproses...',
                'Memproses aktivasi dengan kode {code}...',
                'Mengaktifkan layanan dengan kode {code}...'
            ],
            'activation.check': [
                'Masa aktif Anda tersisa {duration}',
                'Layanan aktif hingga {duration} ke depan',
                'Status aktivasi: aktif, berlaku hingga {duration}'
            ]
        };

        // Get random response for the intent
        const responseList = responses[intent] || ['Maaf, saya tidak mengerti pesan Anda'];
        let response = responseList[Math.floor(Math.random() * responseList.length)];

        // Replace placeholders with actual values
        Object.entries(entities).forEach(([key, value]) => {
            response = response.replace(`{${key}}`, value);
        });

        return response;
    }
}

// Export singleton instance
module.exports = new NLPUtils();
