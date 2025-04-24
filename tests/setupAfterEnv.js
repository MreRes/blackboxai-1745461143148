const mongoose = require('mongoose');
const setup = require('./setup');

// Clear the database before each test
beforeEach(async () => {
    await setup.clearDatabase();
});

// Cleanup after all tests are done
afterAll(async () => {
    await setup.teardown();
});

// Mock WhatsApp utilities
jest.mock('../backend/utils/whatsappUtils', () => ({
    checkNumberExists: jest.fn().mockResolvedValue(true),
    sendMessage: jest.fn().mockResolvedValue(true),
    initialize: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    getStatus: jest.fn().mockReturnValue({ connected: true }),
    getQRCode: jest.fn().mockReturnValue('mock-qr-code')
}));

// Mock NLP utilities
jest.mock('../backend/utils/nlpUtils', () => ({
    processMessage: jest.fn().mockImplementation((message) => {
        if (message.startsWith('keluar')) {
            return {
                intent: 'transaction.expense',
                entities: {
                    amount: 50000,
                    category: 'makan',
                    description: 'makan siang'
                }
            };
        }
        if (message.startsWith('masuk')) {
            return {
                intent: 'transaction.income',
                entities: {
                    amount: 2000000,
                    category: 'gaji',
                    description: 'gaji bulanan'
                }
            };
        }
        if (message.startsWith('budget')) {
            return {
                intent: 'budget.check',
                entities: {
                    category: message.split(' ')[1]
                }
            };
        }
        if (message.startsWith('laporan')) {
            return {
                intent: 'report.daily',
                entities: {}
            };
        }
        if (message === 'help' || message === 'bantuan') {
            return {
                intent: 'help.general',
                entities: {}
            };
        }
        return {
            intent: 'unknown',
            entities: {}
        };
    })
}));

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
});
