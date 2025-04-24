const bcrypt = require('bcrypt');
const crypto = require('crypto');
const ErrorResponse = require('./errorResponse');

class ActivationUtils {
    /**
     * Generate a random activation code
     * @param {number} length - Length of the activation code
     * @returns {string} Generated activation code
     */
    static generateActivationCode(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < length; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    /**
     * Hash an activation code
     * @param {string} code - Plain activation code
     * @returns {Promise<string>} Hashed activation code
     */
    static async hashActivationCode(code) {
        try {
            const salt = await bcrypt.genSalt(Number(process.env.HASH_ROUNDS) || 10);
            return await bcrypt.hash(code, salt);
        } catch (error) {
            throw new ErrorResponse('Failed to hash activation code', 500);
        }
    }

    /**
     * Verify an activation code
     * @param {string} plainCode - Plain activation code to verify
     * @param {string} hashedCode - Hashed activation code to compare against
     * @returns {Promise<boolean>} Whether the code matches
     */
    static async verifyActivationCode(plainCode, hashedCode) {
        try {
            return await bcrypt.compare(plainCode, hashedCode);
        } catch (error) {
            throw new ErrorResponse('Failed to verify activation code', 500);
        }
    }

    /**
     * Calculate expiry date based on duration
     * @param {string|Object} duration - Duration string ('7d', '1m', '1y') or custom object {value: number, unit: string}
     * @returns {Date} Expiry date
     */
    static calculateExpiryDate(duration) {
        const now = new Date();
        
        // Handle custom duration object
        if (typeof duration === 'object' && duration.value && duration.unit) {
            const { value, unit } = duration;
            
            switch (unit.toLowerCase()) {
                case 'days':
                case 'd':
                    return new Date(now.setDate(now.getDate() + parseInt(value)));
                case 'months':
                case 'm':
                    return new Date(now.setMonth(now.getMonth() + parseInt(value)));
                case 'years':
                case 'y':
                    return new Date(now.setFullYear(now.getFullYear() + parseInt(value)));
                default:
                    throw new ErrorResponse('Invalid duration unit', 400);
            }
        }
        
        // Handle duration string
        const match = duration.match(/^(\d+)([dmy])$/);
        if (!match) {
            throw new ErrorResponse('Invalid duration format', 400);
        }

        const [, amount, unit] = match;
        
        switch (unit) {
            case 'd':
                return new Date(now.setDate(now.getDate() + parseInt(amount)));
            case 'm':
                return new Date(now.setMonth(now.getMonth() + parseInt(amount)));
            case 'y':
                return new Date(now.setFullYear(now.getFullYear() + parseInt(amount)));
            default:
                throw new ErrorResponse('Invalid duration unit', 400);
        }
    }

    /**
     * Validate phone number format
     * @param {string} phoneNumber - Phone number to validate
     * @returns {boolean} Whether the phone number is valid
     */
    static isValidPhoneNumber(phoneNumber) {
        // Enhanced phone number validation for Indonesian numbers
        const phoneRegex = /^\+?(62|0)([1-9][0-9]{8,11})$/;
        return phoneRegex.test(phoneNumber);
    }

    /**
     * Format phone number to standard format
     * @param {string} phoneNumber - Phone number to format
     * @returns {string} Formatted phone number
     */
    static formatPhoneNumber(phoneNumber) {
        // Remove any non-digit characters
        let cleaned = phoneNumber.replace(/\D/g, '');
        
        // Remove leading zeros
        cleaned = cleaned.replace(/^0+/, '');
        
        // Ensure number starts with country code
        if (!cleaned.startsWith('62')) {
            cleaned = '62' + cleaned;
        }
        
        return cleaned;
    }

    /**
     * Generate secure random token
     * @param {number} bytes - Number of bytes for token
     * @returns {string} Generated token
     */
    static generateSecureToken(bytes = 32) {
        return crypto.randomBytes(bytes).toString('hex');
    }

    /**
     * Check if activation is expired
     * @param {Date} expiryDate - Expiry date to check
     * @returns {boolean} Whether the activation is expired
     */
    static isExpired(expiryDate) {
        return new Date() > new Date(expiryDate);
    }

    /**
     * Get remaining time for activation
     * @param {Date} expiryDate - Expiry date
     * @returns {Object} Remaining time in different units and formatted string
     */
    static getRemainingTime(expiryDate) {
        const now = new Date();
        const expiry = new Date(expiryDate);
        const diff = expiry - now;

        if (diff <= 0) {
            return { 
                expired: true, 
                remaining: 0,
                formatted: 'Kadaluarsa'
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
            remaining: {
                days,
                hours,
                minutes,
                total: diff
            },
            formatted: formatted.trim()
        };
    }

    /**
     * Validate and process activation request
     * @param {Object} data - Activation request data
     * @returns {Object} Validated and formatted data
     */
    static validateActivationRequest(data) {
        const { username, phoneNumber, duration, phoneNumberLimit } = data;

        if (!username || !phoneNumber) {
            throw new ErrorResponse('Username dan nomor telepon wajib diisi', 400);
        }

        if (!this.isValidPhoneNumber(phoneNumber)) {
            throw new ErrorResponse('Format nomor telepon tidak valid', 400);
        }

        // Format phone number
        const formattedPhone = this.formatPhoneNumber(phoneNumber);

        // Generate activation code
        const activationCode = this.generateActivationCode();

        // Calculate expiry date (default to 7 days if not specified)
        const expiryDate = this.calculateExpiryDate(duration || '7d');

        return {
            username,
            phoneNumber: formattedPhone,
            activationCode,
            expiryDate,
            phoneNumberLimit: phoneNumberLimit || 1, // Default to 1 if not specified
            isActive: true
        };
    }

    /**
     * Generate activation summary
     * @param {Object} user - User object
     * @returns {Object} Activation summary
     */
    static getActivationSummary(user) {
        const remaining = this.getRemainingTime(user.activationExpiry);
        
        return {
            username: user.username,
            isActive: user.isActive,
            phoneNumbers: user.phoneNumbers.map(phone => ({
                number: phone,
                formatted: this.formatPhoneNumber(phone)
            })),
            phoneNumberLimit: user.phoneNumberLimit,
            availableSlots: user.phoneNumberLimit - user.phoneNumbers.length,
            activation: {
                code: user.activationCode, // Only shown to admin
                expiryDate: user.activationExpiry,
                remaining: remaining.formatted,
                isExpired: remaining.expired
            }
        };
    }

    /**
     * Format duration for display
     * @param {string|Object} duration - Duration to format
     * @returns {string} Formatted duration string
     */
    static formatDuration(duration) {
        if (typeof duration === 'object') {
            const { value, unit } = duration;
            switch (unit.toLowerCase()) {
                case 'days':
                case 'd':
                    return `${value} hari`;
                case 'months':
                case 'm':
                    return `${value} bulan`;
                case 'years':
                case 'y':
                    return `${value} tahun`;
                default:
                    return 'Durasi tidak valid';
            }
        }

        const match = duration.match(/^(\d+)([dmy])$/);
        if (!match) return 'Durasi tidak valid';

        const [, amount, unit] = match;
        switch (unit) {
            case 'd':
                return `${amount} hari`;
            case 'm':
                return `${amount} bulan`;
            case 'y':
                return `${amount} tahun`;
            default:
                return 'Durasi tidak valid';
        }
    }

    /**
     * Check if user can add more phone numbers
     * @param {Object} user - User object
     * @returns {Object} Result with status and message
     */
    static canAddPhoneNumber(user) {
        if (!user.isActive) {
            return {
                allowed: false,
                message: 'Akun tidak aktif'
            };
        }

        if (this.isExpired(user.activationExpiry)) {
            return {
                allowed: false,
                message: 'Masa aktif telah berakhir'
            };
        }

        if (user.phoneNumbers.length >= user.phoneNumberLimit) {
            return {
                allowed: false,
                message: 'Batas maksimum nomor telepon telah tercapai'
            };
        }

        return {
            allowed: true,
            message: `Dapat menambah ${user.phoneNumberLimit - user.phoneNumbers.length} nomor telepon lagi`
        };
    }

    /**
     * Generate activation message
     * @param {Object} data - Activation data
     * @returns {string} Formatted activation message
     */
    static generateActivationMessage(data) {
        const { username, activationCode, expiryDate } = data;
        const duration = this.getRemainingTime(expiryDate).formatted;

        return `
Selamat datang di Financial Assistant Bot!

Detail Aktivasi:
Username: ${username}
Kode Aktivasi: ${activationCode}
Masa Berlaku: ${duration}

Cara Aktivasi:
1. Kirim pesan ke bot WhatsApp
2. Ketik: aktivasi ${activationCode}
3. Tunggu konfirmasi aktivasi

Note: Kode aktivasi bersifat rahasia. Jangan bagikan ke orang lain.
`;
    }
}

module.exports = ActivationUtils;
