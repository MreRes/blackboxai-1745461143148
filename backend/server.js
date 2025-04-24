const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const fileUpload = require('express-fileupload');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');
const WhatsAppUtils = require('./utils/whatsappUtils');
const NLPUtils = require('./utils/nlpUtils');
const DatabaseUtils = require('./utils/dbUtils');
const { errorHandler, notFound, rateLimitHandler } = require('./middleware/errorMiddleware');
const ErrorResponse = require('./utils/errorResponse');

// Load environment variables
dotenv.config({ path: './backend/config/.env' });

// Initialize express app
const app = express();

// Security middleware
app.use(helmet()); // Security headers
app.use(mongoSanitize()); // Prevent NoSQL injection
app.use(xss()); // Prevent XSS attacks
app.use(hpp()); // Prevent HTTP param pollution

// Enable CORS with options
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Terlalu banyak permintaan dari IP ini, silakan coba lagi dalam 15 menit',
    handler: rateLimitHandler
});
app.use('/api/', limiter);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// File upload middleware
app.use(fileUpload({
    createParentPath: true,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size
        files: 5 // Max number of files
    },
    abortOnLimit: true,
    responseOnLimit: 'Ukuran file terlalu besar (maksimum 50MB)',
    safeFileNames: true,
    preserveExtension: true
}));

// Compression middleware
app.use(compression());

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../frontend'), {
    maxAge: '1h', // Cache static files for 1 hour
    etag: true
}));

// Database connection with retry mechanism
const connectDB = async (retries = 5) => {
    try {
        await mongoose.connect(process.env.DB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000
        });
        console.log('MongoDB Connected');

        // Set up database event handlers
        mongoose.connection.on('error', err => {
            console.error('MongoDB error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('MongoDB disconnected. Attempting to reconnect...');
        });

        // Create initial backup after connection
        if (process.env.NODE_ENV === 'production') {
            await DatabaseUtils.createBackup({
                type: 'startup',
                description: 'Initial backup on server start'
            });
        }
    } catch (error) {
        console.error('MongoDB connection error:', error);
        if (retries > 0) {
            console.log(`Retrying connection... (${retries} attempts remaining)`);
            setTimeout(() => connectDB(retries - 1), 5000);
        } else {
            console.error('Failed to connect to MongoDB after multiple attempts');
            process.exit(1);
        }
    }
};

// Initialize services (WhatsApp & NLP)
const initializeServices = async () => {
    try {
        // Initialize NLP
        await NLPUtils.initialize();
        console.log('NLP service initialized');

        // Initialize WhatsApp bot
        if (process.env.ENABLE_WHATSAPP === 'true') {
            await WhatsAppUtils.initialize({
                onQRCode: (qrCode) => {
                    console.log('New WhatsApp QR Code generated');
                },
                onReady: () => {
                    console.log('WhatsApp bot is ready');
                },
                onDisconnected: async (reason) => {
                    console.log('WhatsApp bot disconnected:', reason);
                    // Attempt to reconnect after delay
                    setTimeout(async () => {
                        try {
                            await WhatsAppUtils.initialize();
                        } catch (error) {
                            console.error('WhatsApp reconnection failed:', error);
                        }
                    }, 30000);
                },
                onError: (error) => {
                    console.error('WhatsApp bot error:', error);
                }
            });
            console.log('WhatsApp bot service initialized');
        }
    } catch (error) {
        console.error('Service initialization error:', error);
        // Don't exit process, just log error and continue
    }
};

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/budget', require('./routes/budget'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/whatsapp', require('./routes/whatsapp'));
app.use('/api/backup', require('./routes/backup'));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        services: {
            database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            whatsapp: WhatsAppUtils.getStatus(),
            nlp: NLPUtils.initialized ? 'ready' : 'not initialized'
        }
    });
});

// API documentation endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'Financial WhatsApp Bot API',
        version: '1.0.0',
        environment: process.env.NODE_ENV,
        documentation: '/api/docs',
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            transactions: '/api/transactions',
            budget: '/api/budget',
            reports: '/api/reports',
            whatsapp: '/api/whatsapp',
            backup: '/api/backup'
        }
    });
});

// Serve frontend for any other route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server with graceful shutdown
const startServer = async () => {
    try {
        // Connect to database first
        await connectDB();

        const PORT = process.env.PORT || 5000;
        const server = app.listen(PORT, () => {
            console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
            
            // Initialize services after server starts
            initializeServices();
        });

        // Graceful shutdown handler
        const shutdown = async (signal) => {
            console.log(`${signal} received. Starting graceful shutdown...`);
            
            // Create backup before shutdown in production
            if (process.env.NODE_ENV === 'production') {
                try {
                    await DatabaseUtils.createBackup({
                        type: 'shutdown',
                        description: `Backup created during ${signal} shutdown`
                    });
                } catch (error) {
                    console.error('Shutdown backup failed:', error);
                }
            }

            server.close(async () => {
                try {
                    // Disconnect WhatsApp bot
                    if (process.env.ENABLE_WHATSAPP === 'true') {
                        await WhatsAppUtils.disconnect();
                        console.log('WhatsApp bot disconnected');
                    }
                    
                    // Close MongoDB connection
                    await mongoose.connection.close();
                    console.log('MongoDB connection closed');
                    
                    console.log('Graceful shutdown completed');
                    process.exit(0);
                } catch (error) {
                    console.error('Shutdown error:', error);
                    process.exit(1);
                }
            });

            // Force shutdown after timeout
            setTimeout(() => {
                console.error('Could not close connections in time, forcefully shutting down');
                process.exit(1);
            }, 30000);
        };

        // Handle shutdown signals
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        // Handle uncaught exceptions and unhandled rejections
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            shutdown('Uncaught Exception');
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            shutdown('Unhandled Rejection');
        });

    } catch (error) {
        console.error('Server startup error:', error);
        process.exit(1);
    }
};

// Start the server
startServer();

module.exports = app;
