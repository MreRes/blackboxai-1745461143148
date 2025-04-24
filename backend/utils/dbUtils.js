const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const ErrorResponse = require('./errorResponse');

class DatabaseUtils {
    /**
     * Create a backup of the database
     * @param {Object} metadata - Backup metadata
     * @returns {Promise<string>} Backup file path
     */
    static async createBackup(metadata = {}) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path.join(process.env.BACKUP_PATH || 'backups');
            const backupName = `backup-${timestamp}-${crypto.randomBytes(4).toString('hex')}`;
            const backupPath = path.join(backupDir, `${backupName}.json`);
            const metadataPath = path.join(backupDir, `${backupName}.meta.json`);

            // Ensure backup directory exists
            await fs.mkdir(backupDir, { recursive: true });

            // Get all collections
            const collections = mongoose.connection.collections;
            const backup = {};

            // Backup each collection
            for (const [name, collection] of Object.entries(collections)) {
                const documents = await collection.find({}).toArray();
                backup[name] = documents;
            }

            // Add checksum to backup data
            const backupJson = JSON.stringify(backup);
            const checksum = crypto
                .createHash('sha256')
                .update(backupJson)
                .digest('hex');

            // Write backup metadata
            const metadataContent = {
                filename: `${backupName}.json`,
                timestamp: new Date(),
                checksum,
                collections: Object.keys(collections),
                documentsCount: Object.values(backup).reduce((acc, curr) => acc + curr.length, 0),
                size: Buffer.byteLength(backupJson),
                ...metadata
            };

            // Write files
            await Promise.all([
                fs.writeFile(backupPath, backupJson),
                fs.writeFile(metadataPath, JSON.stringify(metadataContent, null, 2))
            ]);

            return backupPath;
        } catch (error) {
            throw new ErrorResponse('Gagal membuat backup', 500);
        }
    }

    /**
     * Restore database from backup file
     * @param {string} backupPath - Path to backup file
     * @param {Object} options - Restore options
     * @returns {Promise<void>}
     */
    static async restoreFromBackup(backupPath, options = {}) {
        try {
            // Verify backup integrity
            await this.validateBackup(backupPath);

            // Read backup file
            const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));

            // Get all collections
            const collections = mongoose.connection.collections;

            // Start a session for atomic restore
            const session = await mongoose.startSession();
            
            try {
                await session.withTransaction(async () => {
                    // Restore each collection
                    for (const [name, data] of Object.entries(backupData)) {
                        if (collections[name]) {
                            // Clear existing data
                            await collections[name].deleteMany({}, { session });
                            
                            // Insert backup data if any exists
                            if (data.length > 0) {
                                await collections[name].insertMany(data, { session });
                            }
                        }
                    }

                    // Log restore operation
                    await this.logBackupActivity({
                        type: 'restore',
                        filename: path.basename(backupPath),
                        admin: options.restoredBy,
                        safetyBackup: options.safetyBackupPath
                    });
                });
            } finally {
                await session.endSession();
            }
        } catch (error) {
            throw new ErrorResponse('Gagal memulihkan backup', 500);
        }
    }

    /**
     * Validate backup file integrity
     * @param {string} backupPath - Path to backup file
     * @returns {Promise<Object>} Validation result
     */
    static async validateBackup(backupPath) {
        try {
            const backupData = await fs.readFile(backupPath, 'utf8');
            const metadataPath = backupPath.replace('.json', '.meta.json');
            
            // Verify metadata exists
            const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

            // Verify checksum
            const currentChecksum = crypto
                .createHash('sha256')
                .update(backupData)
                .digest('hex');

            if (currentChecksum !== metadata.checksum) {
                throw new ErrorResponse('Checksum backup tidak valid', 400);
            }

            // Verify backup structure
            const backup = JSON.parse(backupData);
            const requiredCollections = ['users', 'transactions', 'budgets'];
            
            for (const collection of requiredCollections) {
                if (!backup[collection]) {
                    throw new ErrorResponse(`Koleksi ${collection} tidak ditemukan dalam backup`, 400);
                }
            }

            return {
                isValid: true,
                metadata
            };
        } catch (error) {
            throw new ErrorResponse('Validasi backup gagal: ' + error.message, 400);
        }
    }

    /**
     * List all available backups
     * @param {Object} options - List options
     * @returns {Promise<Object>} List of backups with pagination
     */
    static async listBackups(options = {}) {
        try {
            const backupDir = path.join(process.env.BACKUP_PATH || 'backups');
            await fs.mkdir(backupDir, { recursive: true });

            let files = await fs.readdir(backupDir);
            files = files.filter(file => file.endsWith('.json') && !file.endsWith('.meta.json'));

            // Get file details with metadata
            let backups = await Promise.all(
                files.map(async file => {
                    const filePath = path.join(backupDir, file);
                    const metaPath = filePath.replace('.json', '.meta.json');
                    const stats = await fs.stat(filePath);
                    
                    let metadata = {};
                    try {
                        metadata = JSON.parse(await fs.readFile(metaPath, 'utf8'));
                    } catch (error) {
                        console.warn(`Metadata not found for ${file}`);
                    }

                    return {
                        filename: file,
                        size: stats.size,
                        created: stats.birthtime,
                        ...metadata
                    };
                })
            );

            // Filter by type if specified
            if (options.type) {
                backups = backups.filter(b => b.type === options.type);
            }

            // Sort by creation date (newest first)
            backups.sort((a, b) => b.created - a.created);

            // Paginate results
            const page = options.page || 1;
            const limit = options.limit || 10;
            const startIndex = (page - 1) * limit;
            const endIndex = page * limit;
            const total = backups.length;

            return {
                data: backups.slice(startIndex, endIndex),
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            throw new ErrorResponse('Gagal mendapatkan daftar backup', 500);
        }
    }

    /**
     * Get backup statistics
     * @returns {Promise<Object>} Backup statistics
     */
    static async getBackupStats() {
        try {
            // Get database stats
            const dbStats = {};
            for (const [name, collection] of Object.entries(mongoose.connection.collections)) {
                dbStats[name] = await collection.stats();
            }

            // Get backup stats
            const backups = await this.listBackups();
            const totalSize = backups.data.reduce((acc, curr) => acc + curr.size, 0);

            return {
                databaseSize: Object.values(dbStats).reduce((acc, curr) => acc + curr.size, 0),
                collectionCount: Object.keys(dbStats).length,
                documentCount: Object.values(dbStats).reduce((acc, curr) => acc + curr.count, 0),
                backupCount: backups.pagination.total,
                totalBackupSize: totalSize,
                averageBackupSize: totalSize / backups.pagination.total,
                latestBackup: backups.data[0],
                oldestBackup: backups.data[backups.data.length - 1],
                scheduleEnabled: true, // This should come from config
                backupInterval: process.env.BACKUP_INTERVAL || '24h',
                nextScheduledBackup: new Date(Date.now() + 24 * 60 * 60 * 1000) // Example
            };
        } catch (error) {
            throw new ErrorResponse('Gagal mendapatkan statistik backup', 500);
        }
    }

    /**
     * Clean old backups
     * @param {Object} options - Clean options
     * @returns {Promise<Object>} Cleaning results
     */
    static async cleanOldBackups(options = {}) {
        try {
            const backups = await this.listBackups();
            let toDelete = [];

            if (options.olderThan) {
                const cutoffDate = new Date(Date.now() - options.olderThan);
                toDelete = backups.data.filter(b => new Date(b.created) < cutoffDate);
            } else {
                toDelete = backups.data.slice(options.keep || 5);
            }

            if (options.type) {
                toDelete = toDelete.filter(b => b.type === options.type);
            }

            // Delete files and their metadata
            const deletedSize = toDelete.reduce((acc, curr) => acc + curr.size, 0);
            await Promise.all(
                toDelete.map(async backup => {
                    const basePath = path.join(process.env.BACKUP_PATH || 'backups', backup.filename);
                    await Promise.all([
                        fs.unlink(basePath),
                        fs.unlink(basePath.replace('.json', '.meta.json')).catch(() => {})
                    ]);
                })
            );

            // Log cleaning activity
            await this.logBackupActivity({
                type: 'clean',
                deletedCount: toDelete.length,
                freedSpace: deletedSize,
                admin: options.cleanedBy
            });

            return {
                deletedCount: toDelete.length,
                freedSpace: deletedSize,
                remainingCount: backups.pagination.total - toDelete.length
            };
        } catch (error) {
            throw new ErrorResponse('Gagal membersihkan backup lama', 500);
        }
    }

    /**
     * Log backup activity
     * @param {Object} activity - Activity details
     * @returns {Promise<void>}
     */
    static async logBackupActivity(activity) {
        try {
            const logDir = path.join(process.env.BACKUP_PATH || 'backups', 'logs');
            await fs.mkdir(logDir, { recursive: true });

            const logFile = path.join(logDir, `backup-activity-${new Date().getFullYear()}-${new Date().getMonth() + 1}.log`);
            const logEntry = JSON.stringify({
                timestamp: new Date(),
                ...activity
            }) + '\n';

            await fs.appendFile(logFile, logEntry);
        } catch (error) {
            console.error('Failed to log backup activity:', error);
        }
    }

    /**
     * Handle backup file upload
     * @param {Object} file - Uploaded file
     * @param {Object} options - Upload options
     * @returns {Promise<Object>} Upload result
     */
    static async handleBackupUpload(file, options = {}) {
        try {
            const backupDir = path.join(process.env.BACKUP_PATH || 'backups');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `backup-${timestamp}-uploaded.json`;
            const uploadPath = path.join(backupDir, filename);

            // Move uploaded file
            await file.mv(uploadPath);

            // Validate backup
            const validation = await this.validateBackup(uploadPath);

            // Create metadata
            const metadata = {
                ...validation.metadata,
                uploadedBy: options.uploadedBy,
                uploadedAt: new Date(),
                originalName: file.name
            };

            // Save metadata
            await fs.writeFile(
                uploadPath.replace('.json', '.meta.json'),
                JSON.stringify(metadata, null, 2)
            );

            return {
                filename,
                size: file.size,
                metadata
            };
        } catch (error) {
            throw new ErrorResponse('Gagal mengunggah file backup', 500);
        }
    }
}

module.exports = DatabaseUtils;
