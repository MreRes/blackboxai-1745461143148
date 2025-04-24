/**
 * Custom error class for handling operational errors
 * @extends Error
 */
class ErrorResponse extends Error {
    constructor(message, statusCode, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.success = false;
        this.timestamp = new Date().toISOString();

        // Maintains proper stack trace
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;

        // Map status codes to error codes and Indonesian messages
        const errorMap = {
            400: {
                code: 'BAD_REQUEST',
                defaultMessage: 'Permintaan tidak valid'
            },
            401: {
                code: 'UNAUTHORIZED',
                defaultMessage: 'Tidak memiliki akses'
            },
            403: {
                code: 'FORBIDDEN',
                defaultMessage: 'Akses ditolak'
            },
            404: {
                code: 'NOT_FOUND',
                defaultMessage: 'Data tidak ditemukan'
            },
            409: {
                code: 'CONFLICT',
                defaultMessage: 'Terjadi konflik data'
            },
            422: {
                code: 'UNPROCESSABLE_ENTITY',
                defaultMessage: 'Data tidak dapat diproses'
            },
            429: {
                code: 'TOO_MANY_REQUESTS',
                defaultMessage: 'Terlalu banyak permintaan'
            },
            500: {
                code: 'INTERNAL_SERVER_ERROR',
                defaultMessage: 'Terjadi kesalahan pada server'
            },
            503: {
                code: 'SERVICE_UNAVAILABLE',
                defaultMessage: 'Layanan tidak tersedia'
            }
        };

        if (statusCode && errorMap[statusCode]) {
            this.code = errorMap[statusCode].code;
            this.defaultMessage = errorMap[statusCode].defaultMessage;
        } else {
            this.code = 'ERROR';
            this.defaultMessage = 'Terjadi kesalahan';
        }
    }

    /**
     * Creates a formatted error object for API responses
     */
    toJSON() {
        return {
            success: false,
            error: {
                code: this.code,
                message: this.message || this.defaultMessage,
                statusCode: this.statusCode,
                ...(this.details && { details: this.details }),
                ...(process.env.NODE_ENV === 'development' && {
                    stack: this.stack,
                    timestamp: this.timestamp
                })
            }
        };
    }

    /**
     * Validation error
     */
    static validationError(errors) {
        const validationErrors = Object.values(errors).map(err => ({
            field: err.path,
            message: err.message
                .replace('is required', 'wajib diisi')
                .replace('must be', 'harus')
                .replace('cannot be', 'tidak boleh')
                .replace('invalid', 'tidak valid')
                .replace('already exists', 'sudah ada')
        }));

        return new ErrorResponse('Validasi gagal', 400, { validation: validationErrors });
    }

    /**
     * Authentication errors
     */
    static authenticationError(type) {
        const errors = {
            invalidCredentials: 'Username atau password tidak valid',
            expiredToken: 'Sesi telah berakhir, silakan login kembali',
            invalidToken: 'Token tidak valid',
            accountLocked: 'Akun terkunci karena terlalu banyak percobaan login',
            requiresPasswordChange: 'Harap ganti password Anda',
            invalidActivationCode: 'Kode aktivasi tidak valid',
            expiredActivation: 'Kode aktivasi telah kadaluarsa'
        };

        return new ErrorResponse(errors[type] || 'Autentikasi gagal', 401);
    }

    /**
     * Authorization errors
     */
    static authorizationError(type) {
        const errors = {
            insufficientPermissions: 'Tidak memiliki izin yang diperlukan',
            adminOnly: 'Hanya admin yang dapat mengakses',
            superAdminOnly: 'Hanya super admin yang dapat mengakses',
            inactiveAccount: 'Akun tidak aktif',
            suspendedAccount: 'Akun ditangguhkan'
        };

        return new ErrorResponse(errors[type] || 'Akses ditolak', 403);
    }

    /**
     * Resource not found
     */
    static notFound(resource) {
        const resources = {
            user: 'Pengguna',
            transaction: 'Transaksi',
            budget: 'Budget',
            backup: 'Backup',
            report: 'Laporan',
            file: 'File'
        };

        const resourceName = resources[resource] || resource;
        return new ErrorResponse(`${resourceName} tidak ditemukan`, 404);
    }

    /**
     * Data conflict errors
     */
    static conflict(type) {
        const errors = {
            duplicateUsername: 'Username sudah digunakan',
            duplicatePhone: 'Nomor telepon sudah terdaftar',
            duplicateEmail: 'Email sudah terdaftar',
            duplicateActivationCode: 'Kode aktivasi sudah digunakan',
            maxPhoneNumbers: 'Batas maksimum nomor telepon tercapai'
        };

        return new ErrorResponse(errors[type] || 'Terjadi konflik data', 409);
    }

    /**
     * Rate limiting errors
     */
    static rateLimit(type) {
        const errors = {
            tooManyRequests: 'Terlalu banyak permintaan, silakan coba lagi nanti',
            tooManyLogins: 'Terlalu banyak percobaan login, silakan tunggu beberapa saat',
            tooManyActivations: 'Terlalu banyak percobaan aktivasi, silakan tunggu beberapa saat',
            tooManyMessages: 'Terlalu banyak pesan, silakan tunggu beberapa saat'
        };

        return new ErrorResponse(errors[type] || 'Batas permintaan tercapai', 429);
    }

    /**
     * WhatsApp bot errors
     */
    static whatsAppError(type) {
        const errors = {
            connectionFailed: 'Gagal terhubung ke WhatsApp',
            authenticationFailed: 'Autentikasi WhatsApp gagal',
            messageFailed: 'Gagal mengirim pesan WhatsApp',
            invalidNumber: 'Nomor WhatsApp tidak valid',
            notRegistered: 'Nomor tidak terdaftar di WhatsApp',
            sessionExpired: 'Sesi WhatsApp telah berakhir'
        };

        return new ErrorResponse(errors[type] || 'Terjadi kesalahan pada WhatsApp', 503);
    }

    /**
     * Database errors
     */
    static databaseError(type) {
        const errors = {
            connectionFailed: 'Gagal terhubung ke database',
            queryFailed: 'Query database gagal',
            backupFailed: 'Gagal membuat backup database',
            restoreFailed: 'Gagal memulihkan database',
            invalidBackup: 'File backup tidak valid',
            corruptedData: 'Data rusak atau tidak valid'
        };

        return new ErrorResponse(errors[type] || 'Terjadi kesalahan database', 500);
    }

    /**
     * File operation errors
     */
    static fileError(type) {
        const errors = {
            uploadFailed: 'Gagal mengunggah file',
            downloadFailed: 'Gagal mengunduh file',
            invalidFormat: 'Format file tidak valid',
            tooLarge: 'Ukuran file terlalu besar',
            notFound: 'File tidak ditemukan',
            accessDenied: 'Akses ke file ditolak'
        };

        return new ErrorResponse(errors[type] || 'Terjadi kesalahan file', 500);
    }

    /**
     * NLP processing errors
     */
    static nlpError(type) {
        const errors = {
            processingFailed: 'Gagal memproses pesan',
            invalidFormat: 'Format pesan tidak valid',
            unknownIntent: 'Perintah tidak dikenali',
            missingEntity: 'Informasi tidak lengkap',
            ambiguousIntent: 'Perintah ambigu'
        };

        return new ErrorResponse(errors[type] || 'Gagal memproses bahasa natural', 400);
    }

    /**
     * Server errors
     */
    static serverError(type) {
        const errors = {
            internalError: 'Terjadi kesalahan internal',
            serviceUnavailable: 'Layanan tidak tersedia',
            maintenanceMode: 'Sistem sedang dalam pemeliharaan',
            resourceExhausted: 'Sumber daya server habis',
            thirdPartyError: 'Terjadi kesalahan pada layanan pihak ketiga'
        };

        return new ErrorResponse(errors[type] || 'Terjadi kesalahan pada server', 500);
    }
}

module.exports = ErrorResponse;
