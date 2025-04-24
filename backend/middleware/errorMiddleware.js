const ErrorResponse = require('../utils/errorResponse');

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log error for debugging
    if (process.env.NODE_ENV === 'development') {
        console.error('Error:', {
            name: err.name,
            message: err.message,
            stack: err.stack,
            path: req.path,
            method: req.method,
            body: req.body,
            params: req.params,
            query: req.query,
            user: req.user?.id || req.admin?.id || 'none'
        });
    }

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        error = new ErrorResponse('Data tidak ditemukan', 404);
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        const fieldMap = {
            username: 'Username',
            'phoneNumbers': 'Nomor telepon',
            email: 'Email',
            activationCode: 'Kode aktivasi'
        };
        const fieldName = fieldMap[field] || field;
        error = new ErrorResponse(`${fieldName} sudah terdaftar`, 400);
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(val => {
            // Map English error messages to Indonesian
            const msg = val.message
                .replace('is required', 'wajib diisi')
                .replace('must be', 'harus')
                .replace('cannot be', 'tidak boleh')
                .replace('invalid', 'tidak valid')
                .replace('already exists', 'sudah ada');
            return msg;
        });
        error = new ErrorResponse(messages.join('. '), 400);
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        error = new ErrorResponse('Token tidak valid', 401);
    }

    if (err.name === 'TokenExpiredError') {
        error = new ErrorResponse('Token telah kadaluarsa', 401);
    }

    // File upload errors
    if (err.name === 'MulterError') {
        let message = 'Gagal mengunggah file';
        if (err.code === 'LIMIT_FILE_SIZE') {
            message = 'Ukuran file terlalu besar';
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            message = 'Terlalu banyak file';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            message = 'Tipe file tidak didukung';
        }
        error = new ErrorResponse(message, 400);
    }

    // WhatsApp bot errors
    if (err.name === 'WhatsAppError') {
        let message = 'Terjadi kesalahan pada WhatsApp bot';
        if (err.code === 'CONNECTION_ERROR') {
            message = 'Gagal terhubung ke WhatsApp';
        } else if (err.code === 'AUTH_ERROR') {
            message = 'Otentikasi WhatsApp gagal';
        } else if (err.code === 'SEND_ERROR') {
            message = 'Gagal mengirim pesan WhatsApp';
        }
        error = new ErrorResponse(message, 503);
    }

    // Database errors
    if (err.name === 'MongoError' || err.name === 'MongooseError') {
        let message = 'Terjadi kesalahan pada database';
        if (err.code === 'ETIMEDOUT') {
            message = 'Koneksi database timeout';
        }
        error = new ErrorResponse(message, 500);
    }

    // Rate limiting errors
    if (err.name === 'TooManyRequests') {
        error = new ErrorResponse('Terlalu banyak permintaan, silakan coba lagi nanti', 429);
    }

    // Activation errors
    if (err.name === 'ActivationError') {
        let message = 'Terjadi kesalahan pada aktivasi';
        if (err.code === 'EXPIRED') {
            message = 'Kode aktivasi telah kadaluarsa';
        } else if (err.code === 'INVALID') {
            message = 'Kode aktivasi tidak valid';
        } else if (err.code === 'LIMIT_REACHED') {
            message = 'Batas maksimum perangkat tercapai';
        }
        error = new ErrorResponse(message, 400);
    }

    // NLP errors
    if (err.name === 'NLPError') {
        let message = 'Gagal memproses pesan';
        if (err.code === 'PARSE_ERROR') {
            message = 'Format pesan tidak valid';
        } else if (err.code === 'INTENT_ERROR') {
            message = 'Perintah tidak dikenali';
        }
        error = new ErrorResponse(message, 400);
    }

    // Backup/Restore errors
    if (err.name === 'BackupError') {
        let message = 'Terjadi kesalahan pada backup/restore';
        if (err.code === 'BACKUP_FAILED') {
            message = 'Gagal membuat backup';
        } else if (err.code === 'RESTORE_FAILED') {
            message = 'Gagal melakukan restore';
        }
        error = new ErrorResponse(message, 500);
    }

    // Default error response
    res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Terjadi kesalahan pada server',
        ...(process.env.NODE_ENV === 'development' && {
            stack: error.stack,
            details: error.details,
            code: err.code
        })
    });
};

/**
 * Async handler to eliminate try-catch blocks
 */
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Not Found handler
 */
const notFound = (req, res, next) => {
    next(new ErrorResponse(`Halaman tidak ditemukan - ${req.originalUrl}`, 404));
};

/**
 * Rate limit handler
 */
const rateLimitHandler = (req, res) => {
    res.status(429).json({
        success: false,
        error: 'Terlalu banyak permintaan, silakan coba lagi nanti'
    });
};

/**
 * Validation error handler
 */
const validationErrorHandler = (err, req, res, next) => {
    if (err.name === 'ValidationError') {
        const details = Object.values(err.errors).map(error => ({
            field: error.path,
            message: error.message
                .replace('is required', 'wajib diisi')
                .replace('must be', 'harus')
                .replace('cannot be', 'tidak boleh')
                .replace('invalid', 'tidak valid')
        }));

        return res.status(400).json({
            success: false,
            error: 'Validasi gagal',
            details
        });
    }
    next(err);
};

/**
 * WhatsApp error handler
 */
const whatsAppErrorHandler = (err, req, res, next) => {
    if (err.name === 'WhatsAppError') {
        const errorMessages = {
            CONNECTION_ERROR: 'Gagal terhubung ke WhatsApp',
            AUTH_ERROR: 'Otentikasi WhatsApp gagal',
            SEND_ERROR: 'Gagal mengirim pesan WhatsApp',
            RATE_LIMIT: 'Batas pengiriman pesan tercapai',
            INVALID_NUMBER: 'Nomor WhatsApp tidak valid',
            MESSAGE_TOO_LONG: 'Pesan terlalu panjang'
        };

        return res.status(503).json({
            success: false,
            error: errorMessages[err.code] || 'Terjadi kesalahan pada WhatsApp bot'
        });
    }
    next(err);
};

module.exports = {
    errorHandler,
    asyncHandler,
    notFound,
    rateLimitHandler,
    validationErrorHandler,
    whatsAppErrorHandler
};
