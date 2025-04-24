const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const ErrorResponse = require('../utils/errorResponse');

const adminSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username wajib diisi'],
        unique: true,
        trim: true,
        maxlength: [50, 'Username tidak boleh lebih dari 50 karakter']
    },
    password: {
        type: String,
        required: [true, 'Password wajib diisi'],
        minlength: [6, 'Password minimal 6 karakter'],
        select: false
    },
    role: {
        type: String,
        enum: ['admin', 'super_admin'],
        default: 'admin'
    },
    permissions: [{
        type: String,
        enum: [
            'manage_users',          // Manage user accounts
            'manage_transactions',   // View/edit all user transactions
            'manage_budgets',        // View/edit user budgets
            'view_reports',          // Access analytics and reports
            'manage_admins',         // Manage admin accounts (super_admin only)
            'manage_bot',            // Configure WhatsApp bot settings
            'backup_restore',        // Perform backup/restore operations
            'manage_activation'      // Manage activation codes and periods
        ]
    }],
    lastLogin: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    loginAttempts: {
        count: {
            type: Number,
            default: 0
        },
        lastAttempt: {
            type: Date,
            default: null
        },
        lockUntil: {
            type: Date,
            default: null
        }
    },
    securitySettings: {
        requirePasswordChange: {
            type: Boolean,
            default: false
        },
        lastPasswordChange: {
            type: Date,
            default: Date.now
        },
        twoFactorEnabled: {
            type: Boolean,
            default: false
        },
        twoFactorSecret: {
            type: String,
            select: false
        }
    },
    preferences: {
        language: {
            type: String,
            enum: ['id', 'en'],
            default: 'id'
        },
        timezone: {
            type: String,
            default: 'Asia/Jakarta'
        },
        theme: {
            type: String,
            enum: ['light', 'dark'],
            default: 'light'
        }
    },
    systemSettings: {
        defaultActivationDuration: {
            type: String,
            default: '7d',
            validate: {
                validator: function(v) {
                    return /^\d+[dmy]$/.test(v);
                },
                message: 'Format durasi aktivasi tidak valid (contoh: 7d, 1m, 1y)'
            }
        },
        maxPhoneNumbersPerUser: {
            type: Number,
            default: 1,
            min: [1, 'Minimal 1 nomor per user'],
            max: [5, 'Maksimal 5 nomor per user']
        },
        activationCodeLength: {
            type: Number,
            default: 8,
            min: [6, 'Minimal 6 karakter'],
            max: [12, 'Maksimal 12 karakter']
        },
        whatsappBot: {
            enabled: {
                type: Boolean,
                default: true
            },
            autoReply: {
                type: Boolean,
                default: true
            },
            dailyLimit: {
                type: Number,
                default: 1000
            },
            allowedCommands: [{
                type: String,
                enum: ['transaction', 'budget', 'report', 'help']
            }]
        },
        backup: {
            autoBackup: {
                type: Boolean,
                default: true
            },
            backupInterval: {
                type: String,
                default: '1d'
            },
            retentionPeriod: {
                type: Number,
                default: 7
            }
        }
    }
}, {
    timestamps: true
});

// Hash password before saving
adminSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        try {
            const salt = await bcrypt.genSalt(Number(process.env.HASH_ROUNDS) || 10);
            this.password = await bcrypt.hash(this.password, salt);
            this.securitySettings.lastPasswordChange = Date.now();
        } catch (error) {
            return next(new ErrorResponse('Gagal mengenkripsi password', 500));
        }
    }
    next();
});

// Set default permissions based on role
adminSchema.pre('save', function(next) {
    if (this.isNew || this.isModified('role')) {
        if (this.role === 'super_admin') {
            this.permissions = [
                'manage_users',
                'manage_transactions',
                'manage_budgets',
                'view_reports',
                'manage_admins',
                'manage_bot',
                'backup_restore',
                'manage_activation'
            ];
        } else {
            this.permissions = [
                'manage_users',
                'manage_transactions',
                'manage_budgets',
                'view_reports'
            ];
        }
    }
    next();
});

// Sign JWT and return
adminSchema.methods.getSignedJwtToken = function() {
    return jwt.sign(
        {
            id: this._id,
            username: this.username,
            role: this.role,
            permissions: this.permissions
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRE || '1d'
        }
    );
};

// Match password
adminSchema.methods.matchPassword = async function(enteredPassword) {
    try {
        return await bcrypt.compare(enteredPassword, this.password);
    } catch (error) {
        throw new ErrorResponse('Gagal memverifikasi password', 500);
    }
};

// Check if account is locked
adminSchema.methods.isLocked = function() {
    return this.loginAttempts.lockUntil && this.loginAttempts.lockUntil > Date.now();
};

// Increment login attempts
adminSchema.methods.incrementLoginAttempts = async function() {
    if (this.loginAttempts.lockUntil && this.loginAttempts.lockUntil < Date.now()) {
        await this.updateOne({
            $set: {
                'loginAttempts.count': 1,
                'loginAttempts.lastAttempt': Date.now(),
                'loginAttempts.lockUntil': null
            }
        });
        return;
    }

    const updates = {
        $inc: { 'loginAttempts.count': 1 },
        $set: { 'loginAttempts.lastAttempt': Date.now() }
    };

    if (this.loginAttempts.count + 1 >= 5) {
        updates.$set['loginAttempts.lockUntil'] = Date.now() + 30 * 60 * 1000; // Lock for 30 minutes
    }

    await this.updateOne(updates);
};

// Reset login attempts
adminSchema.methods.resetLoginAttempts = async function() {
    await this.updateOne({
        $set: {
            'loginAttempts.count': 0,
            'loginAttempts.lastAttempt': null,
            'loginAttempts.lockUntil': null,
            lastLogin: Date.now()
        }
    });
};

// Check if admin has specific permission
adminSchema.methods.hasPermission = function(permission) {
    return this.permissions.includes(permission) || this.role === 'super_admin';
};

// Check if password needs to be changed
adminSchema.methods.needsPasswordChange = function() {
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    return this.securitySettings.requirePasswordChange || 
           (Date.now() - this.securitySettings.lastPasswordChange) > ninetyDays;
};

// Update system settings
adminSchema.methods.updateSystemSettings = async function(settings) {
    if (!this.hasPermission('manage_bot') && settings.whatsappBot) {
        throw new ErrorResponse('Tidak memiliki izin untuk mengubah pengaturan bot', 403);
    }
    
    if (!this.hasPermission('backup_restore') && settings.backup) {
        throw new ErrorResponse('Tidak memiliki izin untuk mengubah pengaturan backup', 403);
    }
    
    if (!this.hasPermission('manage_activation') && 
        (settings.defaultActivationDuration || settings.maxPhoneNumbersPerUser)) {
        throw new ErrorResponse('Tidak memiliki izin untuk mengubah pengaturan aktivasi', 403);
    }

    Object.assign(this.systemSettings, settings);
    await this.save();
};

// Get system settings
adminSchema.methods.getSystemSettings = function() {
    return {
        activation: {
            defaultDuration: this.systemSettings.defaultActivationDuration,
            maxPhoneNumbers: this.systemSettings.maxPhoneNumbersPerUser,
            codeLength: this.systemSettings.activationCodeLength
        },
        whatsappBot: this.systemSettings.whatsappBot,
        backup: this.systemSettings.backup
    };
};

// Indexes for faster queries
adminSchema.index({ username: 1 }, { unique: true });
adminSchema.index({ status: 1 });
adminSchema.index({ role: 1 });
adminSchema.index({ lastLogin: 1 });
adminSchema.index({ 'loginAttempts.lockUntil': 1 });

module.exports = mongoose.model('Admin', adminSchema);
