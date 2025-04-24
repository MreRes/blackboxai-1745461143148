const request = require('supertest');
const app = require('../../backend/server');
const User = require('../../backend/models/User');
const Transaction = require('../../backend/models/Transaction');
const Budget = require('../../backend/models/Budget');
const WhatsAppUtils = require('../../backend/utils/whatsappUtils');
const NLPUtils = require('../../backend/utils/nlpUtils');

describe('WhatsApp Bot Integration', () => {
    let user;
    const phoneNumber = '6281234567890';

    beforeEach(async () => {
        await User.deleteMany({});
        await Transaction.deleteMany({});
        await Budget.deleteMany({});

        // Create test user
        user = await User.create({
            username: 'testuser',
            activationCode: 'TEST123',
            activationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
            isActive: true,
            phoneNumbers: [phoneNumber],
            status: 'active'
        });
    });

    describe('Activation Process', () => {
        it('should activate new user with valid code', async () => {
            const newUser = await User.create({
                username: 'newuser',
                activationCode: 'NEWCODE',
                activationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
                isActive: true
            });

            const message = {
                from: '6289876543210',
                message: 'aktivasi NEWCODE'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('Selamat datang');

            const updatedUser = await User.findById(newUser._id);
            expect(updatedUser.phoneNumbers).toContain('6289876543210');
        });

        it('should reject activation with invalid code', async () => {
            const message = {
                from: '6289876543210',
                message: 'aktivasi WRONGCODE'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('tidak valid');
        });
    });

    describe('Transaction Recording', () => {
        it('should record expense transaction', async () => {
            const message = {
                from: phoneNumber,
                message: 'keluar 50rb makan siang'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('Pengeluaran sebesar Rp 50.000 untuk makan berhasil dicatat');

            const transaction = await Transaction.findOne({
                userId: user._id,
                type: 'expense',
                category: 'makan'
            });
            expect(transaction).toBeTruthy();
            expect(transaction.amount).toBe(50000);
        });

        it('should record income transaction', async () => {
            const message = {
                from: phoneNumber,
                message: 'masuk 2jt gaji'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('Pemasukan sebesar Rp 2.000.000 untuk gaji berhasil dicatat');

            const transaction = await Transaction.findOne({
                userId: user._id,
                type: 'income',
                category: 'gaji'
            });
            expect(transaction).toBeTruthy();
            expect(transaction.amount).toBe(2000000);
        });
    });

    describe('Budget Management', () => {
        beforeEach(async () => {
            // Create test budget
            await Budget.create({
                userId: user._id,
                category: 'makan',
                amount: 1000000,
                period: 'monthly',
                startDate: new Date(),
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });
        });

        it('should check category budget', async () => {
            const message = {
                from: phoneNumber,
                message: 'budget makan'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('Budget makan');
            expect(res.body.data.response).toContain('Rp 1.000.000');
        });

        it('should warn when expense exceeds budget threshold', async () => {
            // Record expense that triggers warning
            const message = {
                from: phoneNumber,
                message: 'keluar 900rb makan'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('Peringatan');
            expect(res.body.data.response).toContain('90%');
        });
    });

    describe('Report Generation', () => {
        beforeEach(async () => {
            // Create some test transactions
            await Transaction.create([
                {
                    userId: user._id,
                    type: 'expense',
                    category: 'makan',
                    amount: 50000,
                    description: 'Makan siang',
                    date: new Date(),
                    source: 'whatsapp'
                },
                {
                    userId: user._id,
                    type: 'income',
                    category: 'gaji',
                    amount: 2000000,
                    description: 'Gaji bulanan',
                    date: new Date(),
                    source: 'whatsapp'
                }
            ]);
        });

        it('should generate daily report', async () => {
            const message = {
                from: phoneNumber,
                message: 'laporan hari ini'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('Laporan Hari Ini');
            expect(res.body.data.response).toContain('Rp 50.000');
            expect(res.body.data.response).toContain('Rp 2.000.000');
        });

        it('should generate monthly report', async () => {
            const message = {
                from: phoneNumber,
                message: 'laporan bulan ini'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('Laporan Bulan Ini');
            expect(res.body.data.response).toContain('Total Pemasukan');
            expect(res.body.data.response).toContain('Total Pengeluaran');
        });
    });

    describe('Help and Support', () => {
        it('should provide help information', async () => {
            const message = {
                from: phoneNumber,
                message: 'help'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('Panduan Penggunaan Bot');
            expect(res.body.data.response).toContain('Catat Transaksi');
            expect(res.body.data.response).toContain('Cek Budget');
            expect(res.body.data.response).toContain('Lihat Laporan');
        });

        it('should handle unknown commands gracefully', async () => {
            const message = {
                from: phoneNumber,
                message: 'unknown command'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('tidak mengerti');
            expect(res.body.data.response).toContain('help');
        });
    });

    describe('Error Handling', () => {
        it('should handle unregistered numbers', async () => {
            const message = {
                from: '6289999999999',
                message: 'keluar 50rb makan'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('belum terdaftar');
        });

        it('should handle expired activation', async () => {
            // Update user with expired activation
            user.activationExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000);
            await user.save();

            const message = {
                from: phoneNumber,
                message: 'keluar 50rb makan'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('Masa aktif');
            expect(res.body.data.response).toContain('berakhir');
        });
    });
});
