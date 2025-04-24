const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');
const ErrorResponse = require('../utils/errorResponse');
const { isValidPhoneNumber } = require('../utils/activationUtils');

/**
 * Protect routes - Verify user token
 */
exports.protect = async (req, res, next) => {
    try {
        let token;

        // Get token from Authorization header
        if (req.headers.authorization?.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return next(new ErrorResponse('Tidak memiliki akses ke rute ini', 401));
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get user from token
            const user = await User.findById(decoded.id);

            if (!user) {
                return next(new ErrorResponse('User tidak ditemukan', 401));
            }

            // Check if user is active
            if (!user.isActive) {
                return next(new ErrorResponse('Akun tidak aktif', 401));
            }

            // Check if activation is expired
            if (user.isActivationExpired) {
                return next(new ErrorResponse('Masa aktif telah berakhir', 401));
            }

            // Add user and token data to request
            req.user = user;
            req.token = decoded;
            next();
        } catch (err) {
            return next(new ErrorResponse('Token tidak valid', 401));
        }
    } catch (error) {
        next(error);
    }
};

/**
 * Protect admin routes - Verify admin token
 */
exports.protectAdmin = async (req, res, next) => {
    try {
        let token;

        // Get token from Authorization header
        if (req.headers.authorization?.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return next(new ErrorResponse('Tidak memiliki akses ke rute ini', 401));
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get admin from token with password for security checks
            const admin = await Admin.findById(decoded.id)
                .select('+password +securitySettings.twoFactorSecret');

            if (!admin) {
                return next(new ErrorResponse('Admin tidak ditemukan', 401));
            }

            // Check if admin is active
            if (admin.status !== 'active') {
                return next(new ErrorResponse('Akun admin tidak aktif', 401));
            }

            // Check if account is locked
            if (admin.isLocked()) {
                const lockTime = Math.ceil((admin.loginAttempts.lockUntil - Date.now()) / 1000 / 60);
                return next(new ErrorResponse(`Akun terkunci. Coba lagi dalam ${lockTime} menit`, 401));
            }

            // Check if password change is required
            if (admin.needsPasswordChange()) {
                return next(new ErrorResponse('Harap ganti password Anda', 401));
            }

            // Add admin and token data to request
            req.admin = admin;
            req.token = decoded;
            next();
        } catch (err) {
            return next(new ErrorResponse('Token tidak valid', 401));
        }
    } catch (error) {
        next(error);
    }
};

/**
 * Grant access to specific roles
 */
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.admin.role)) {
            return next(
                new ErrorResponse(
                    `Role ${req.admin.role} tidak memiliki akses ke rute ini`,
                    403
                )
            );
        }
        next();
    };
};

/**
 * Check specific permissions
 */
exports.checkPermission = (permission) => {
    return (req, res, next) => {
        if (!req.admin.hasPermission(permission)) {
            return next(
                new ErrorResponse(
                    'Tidak memiliki izin untuk melakukan tindakan ini',
                    403
                )
            );
        }
        next();
    };
};

/**
 * Validate WhatsApp source
 */
exports.validateWhatsAppSource = async (req, res, next) => {
    try {
        const phoneNumber = req.body.source || req.query.source;

        if (!phoneNumber) {
            return next(new ErrorResponse('Nomor telepon wajib diisi', 400));
        }

        // Validate phone number format
        if (!isValidPhoneNumber(phoneNumber)) {
            return next(new ErrorResponse('Format nomor telepon tidak valid', 400));
        }

        // Find user with this phone number
        const user = await User.findOne({
            phoneNumbers: phoneNumber,
            isActive: true,
            status: 'active'
        });

        if (!user) {
            return next(new ErrorResponse('Nomor telepon tidak terdaftar atau tidak aktif', 401));
        }

        // Check if activation is expired
        if (user.isActivationExpired) {
            return next(new ErrorResponse('Masa aktif telah berakhir', 401));
        }

        // Add user and phone data to request
        req.user = user;
        req.phoneNumber = phoneNumber;
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Validate WhatsApp webhook
 */
exports.validateWhatsAppWebhook = async (req, res, next) => {
    try {
        // Verify webhook token if provided by WhatsApp
        const token = req.query['hub.verify_token'];
        if (token) {
            if (token === process.env.WHATSAPP_VERIFY_TOKEN) {
                return res.send(req.query['hub.challenge']);
            }
            return next(new ErrorResponse('Token webhook tidak valid', 403));
        }

        // Verify webhook signature for POST requests
        const signature = req.headers['x-hub-signature'];
        if (!signature) {
            return next(new ErrorResponse('Signature webhook tidak ditemukan', 403));
        }

        // Add webhook validation logic here based on your WhatsApp API provider
        // This is just a placeholder - implement actual signature verification

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Rate limiting for WhatsApp bot
 */
exports.whatsAppRateLimit = async (req, res, next) => {
    try {
        const phoneNumber = req.phoneNumber;
        const key = `whatsapp:${phoneNumber}:requests`;
        
        // Implement rate limiting logic here
        // This is a placeholder - implement actual rate limiting
        // You might want to use Redis or similar for production

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Check if admin has super admin privileges
 */
exports.isSuperAdmin = (req, res, next) => {
    if (req.admin.role !== 'super_admin') {
        return next(
            new ErrorResponse(
                'Hanya Super Admin yang dapat mengakses rute ini',
                403
            )
        );
    }
    next();
};

/**
 * Validate activation code
 */
exports.validateActivationCode = async (req, res, next) => {
    try {
        const { activationCode } = req.body;

        if (!activationCode) {
            return next(new ErrorResponse('Kode aktivasi wajib diisi', 400));
        }

        const user = await User.findOne({ activationCode });

        if (!user) {
            return next(new ErrorResponse('Kode aktivasi tidak valid', 401));
        }

        if (user.isActivationExpired) {
            return next(new ErrorResponse('Kode aktivasi telah kadaluarsa', 401));
        }

        req.activationUser = user;
        next();
    } catch (error) {
        next(error);
    }
};
