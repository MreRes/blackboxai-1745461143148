const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const ErrorResponse = require('../utils/errorResponse');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username wajib diisi'],
        unique: true,
        trim: true,
        maxlength: [50, 'Username tidak boleh lebih dari 50 karakter']
    },
    activationCode: {
        type: String,
        required: [true, 'Kode aktivasi wajib diisi']
    },
    activationExpiry: {
        type: Date,
        required: [true, 'Tanggal kadaluarsa aktivasi wajib diisi']
    },
    isActive: {
        type: Boolean,
        default: true
    },
    phoneNumbers: [{
        type: String,
        validate: {
            validator: function(v) {
                return /^62[1-9][0-9]{8,11}$/.test(v);
            },
            message: props => `${props.value} bukan nomor telepon yang valid!`
        }
    }],
    phoneNumberLimit: {
        type: Number,
        default: 1,
        min: [1, 'Minimal harus mengizinkan satu nomor telepon'],
        max: [5, 'Tidak boleh lebih dari 5 nomor telepon']
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    balance: {
        type: Number,
        default: 0
    },
    settings: {
        language: {
            type: String,
            enum: ['id', 'en'],
            default: 'id'
        },
        timezone: {
            type: String,
            default: 'Asia/Jakarta'
        },
        notifications: {
            dailyReport: {
                type: Boolean,
                default: true
            },
            weeklyReport: {
                type: Boolean,
                default: true
            },
            monthlyReport: {
                type: Boolean,
                default: true
            },
            budgetAlerts: {
                type: Boolean,
                default: true
            }
        }
    },
    lastActivity: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Hash activation code before saving
userSchema.pre('save', async function(next) {
    if (this.isModified('activationCode')) {
        try {
            const salt = await bcrypt.genSalt(Number(process.env.HASH_ROUNDS) || 10);
            this.activationCode = await bcrypt.hash(this.activationCode, salt);
        } catch (error) {
            return next(new ErrorResponse('Gagal mengenkripsi kode aktivasi', 500));
        }
    }
    next();
});

// Update lastActivity timestamp on document update
userSchema.pre('save', function(next) {
    this.lastActivity = new Date();
    next();
});

// Sign JWT and return
userSchema.methods.getSignedJwtToken = function() {
    return jwt.sign(
        { 
            id: this._id,
            username: this.username,
            isActive: this.isActive,
            status: this.status
        },
        process.env.JWT_SECRET,
        { 
            expiresIn: process.env.JWT_EXPIRE || '1d'
        }
    );
};

// Match activation code
userSchema.methods.matchActivationCode = async function(enteredCode) {
    try {
        return await bcrypt.compare(enteredCode, this.activationCode);
    } catch (error) {
        throw new ErrorResponse('Gagal memverifikasi kode aktivasi', 500);
    }
};

// Check if phone number is registered and user is active
userSchema.methods.isPhoneRegistered = function(phoneNumber) {
    return this.isActive && 
           this.status === 'active' && 
           this.phoneNumbers.includes(phoneNumber) &&
           !this.isActivationExpired;
};

// Add phone number if under limit
userSchema.methods.addPhoneNumber = function(phoneNumber) {
    if (!this.isActive) {
        throw new ErrorResponse('Akun tidak aktif', 400);
    }
    
    if (this.isActivationExpired) {
        throw new ErrorResponse('Masa aktif telah berakhir', 400);
    }
    
    if (this.phoneNumbers.length >= this.phoneNumberLimit) {
        throw new ErrorResponse('Batas maksimum nomor telepon tercapai', 400);
    }
    
    if (this.phoneNumbers.includes(phoneNumber)) {
        throw new ErrorResponse('Nomor telepon sudah terdaftar', 400);
    }
    
    this.phoneNumbers.push(phoneNumber);
};

// Remove phone number
userSchema.methods.removePhoneNumber = function(phoneNumber) {
    const index = this.phoneNumbers.indexOf(phoneNumber);
    if (index > -1) {
        this.phoneNumbers.splice(index, 1);
    }
};

// Update activation
userSchema.methods.updateActivation = function(duration) {
    const now = new Date();
    
    // Parse duration string (e.g., '7d', '1m', '1y')
    const match = duration.match(/^(\d+)([dmy])$/);
    if (!match) {
        throw new ErrorResponse('Format durasi tidak valid', 400);
    }

    const [, amount, unit] = match;
    
    switch (unit) {
        case 'd':
            this.activationExpiry = new Date(now.setDate(now.getDate() + parseInt(amount)));
            break;
        case 'm':
            this.activationExpiry = new Date(now.setMonth(now.getMonth() + parseInt(amount)));
            break;
        case 'y':
            this.activationExpiry = new Date(now.setFullYear(now.getFullYear() + parseInt(amount)));
            break;
        default:
            throw new ErrorResponse('Unit durasi tidak valid', 400);
    }
    
    this.isActive = true;
};

// Virtual for checking if activation is expired
userSchema.virtual('isActivationExpired').get(function() {
    return Date.now() > this.activationExpiry;
});

// Virtual for remaining activation time
userSchema.virtual('remainingActivation').get(function() {
    const now = new Date();
    const expiry = new Date(this.activationExpiry);
    const diff = expiry - now;

    if (diff <= 0) {
        return {
            expired: true,
            remaining: 'Kadaluarsa'
        };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    let formatted = '';
    if (days > 0) formatted += `${days} hari `;
    if (hours > 0) formatted += `${hours} jam `;
    if (minutes > 0) formatted += `${minutes} menit`;

    return {
        expired: false,
        remaining: formatted.trim()
    };
});

// Virtual for available phone number slots
userSchema.virtual('availablePhoneSlots').get(function() {
    return this.phoneNumberLimit - this.phoneNumbers.length;
});

// Virtual populate transactions
userSchema.virtual('transactions', {
    ref: 'Transaction',
    localField: '_id',
    foreignField: 'userId'
});

// Virtual populate budgets
userSchema.virtual('budgets', {
    ref: 'Budget',
    localField: '_id',
    foreignField: 'userId'
});

// Indexes for faster queries
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ phoneNumbers: 1 });
userSchema.index({ activationExpiry: 1 });
userSchema.index({ status: 1 });
userSchema.index({ createdAt: 1 });
userSchema.index({ lastActivity: 1 });

module.exports = mongoose.model('User', userSchema);
