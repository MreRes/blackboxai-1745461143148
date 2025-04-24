const request = require('supertest');
const app = require('../../backend/server');
const User = require('../../backend/models/User');
const ActivationUtils = require('../../backend/utils/activationUtils');
const WhatsAppUtils = require('../../backend/utils/whatsappUtils');

describe('Authentication & Activation Flow', () => {
    beforeEach(async () => {
        await User.deleteMany({});
    });

    describe('User Creation & Activation', () => {
        it('should create user with activation code', async () => {
            const userData = {
                username: 'testuser',
                phoneNumber: '6281234567890',
                duration: '7d'
            };

            const res = await request(app)
                .post('/api/users')
                .send(userData)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.user.username).toBe(userData.username);
            expect(res.body.data.activation.code).toBeDefined();
        });

        it('should activate user via WhatsApp', async () => {
            // Create user first
            const user = await User.create({
                username: 'testuser',
                activationCode: 'TEST123',
                activationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
                isActive: true
            });

            const message = {
                from: '6281234567890',
                message: 'aktivasi TEST123'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            
            const updatedUser = await User.findById(user._id);
            expect(updatedUser.phoneNumbers).toContain('6281234567890');
        });
    });

    describe('Login Flow', () => {
        it('should login with username and activation code', async () => {
            const activationCode = 'TEST123';
            const user = await User.create({
                username: 'testuser',
                activationCode: await ActivationUtils.hashActivationCode(activationCode),
                activationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
                isActive: true,
                status: 'active'
            });

            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'testuser',
                    activationCode: 'TEST123'
                });

            expect(res.status).toBe(200);
            expect(res.body.token).toBeDefined();
            expect(res.body.user.username).toBe('testuser');
        });

        it('should reject login with expired activation', async () => {
            const user = await User.create({
                username: 'testuser',
                activationCode: await ActivationUtils.hashActivationCode('TEST123'),
                activationExpiry: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired
                isActive: true,
                status: 'active'
            });

            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'testuser',
                    activationCode: 'TEST123'
                });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });
    });

    describe('WhatsApp Integration', () => {
        it('should handle transaction via WhatsApp', async () => {
            // Create activated user
            const user = await User.create({
                username: 'testuser',
                activationCode: 'TEST123',
                activationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
                isActive: true,
                phoneNumbers: ['6281234567890']
            });

            const message = {
                from: '6281234567890',
                message: 'keluar 50rb makan'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('Pengeluaran sebesar Rp 50.000 untuk makan berhasil dicatat');
        });

        it('should check budget via WhatsApp', async () => {
            // Create activated user with budget
            const user = await User.create({
                username: 'testuser',
                activationCode: 'TEST123',
                activationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
                isActive: true,
                phoneNumbers: ['6281234567890']
            });

            await Budget.create({
                userId: user._id,
                category: 'makan',
                amount: 1000000,
                period: 'monthly',
                startDate: new Date(),
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });

            const message = {
                from: '6281234567890',
                message: 'budget makan'
            };

            const res = await request(app)
                .post('/api/whatsapp/message')
                .send(message);

            expect(res.status).toBe(200);
            expect(res.body.data.response).toContain('Budget makan');
        });
    });
});
