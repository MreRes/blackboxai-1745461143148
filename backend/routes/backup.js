const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const DatabaseUtils = require('../utils/dbUtils');
const ErrorResponse = require('../utils/errorResponse');
const { protectAdmin, checkPermission, isSuperAdmin } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');

/**
 * @route   POST /api/backup/create
 * @desc    Create a new database backup
 * @access  Private (Admin)
 */
router.post('/create', [protectAdmin, checkPermission('backup_restore')], asyncHandler(async (req, res) => {
    const { description } = req.body;
    
    // Create backup with metadata
    const backupPath = await DatabaseUtils.createBackup({
        createdBy: req.admin.username,
        description: description || 'Manual backup',
        type: 'manual'
    });

    // Get backup stats
    const stats = await fs.stat(backupPath);

    res.json({
        success: true,
        data: {
            filename: path.basename(backupPath),
            path: backupPath,
            size: stats.size,
            created: stats.birthtime,
            description,
            createdBy: req.admin.username
        },
        message: 'Backup berhasil dibuat'
    });
}));

/**
 * @route   POST /api/backup/restore
 * @desc    Restore database from backup file
 * @access  Private (Super Admin)
 */
router.post('/restore', [protectAdmin, isSuperAdmin], asyncHandler(async (req, res) => {
    const { filename, confirmationCode } = req.body;

    if (!filename) {
        throw new ErrorResponse('Nama file backup wajib diisi', 400);
    }

    // Require confirmation code for restore operation
    if (!confirmationCode || confirmationCode !== process.env.RESTORE_CONFIRMATION_CODE) {
        throw new ErrorResponse('Kode konfirmasi tidak valid', 401);
    }

    // Verify backup file exists
    const backupPath = path.join(process.env.BACKUP_PATH || 'backups', filename);
    try {
        await fs.access(backupPath);
    } catch (error) {
        throw new ErrorResponse('File backup tidak ditemukan', 404);
    }

    // Create a safety backup before restoring
    const safetyBackupPath = await DatabaseUtils.createBackup({
        createdBy: req.admin.username,
        description: 'Safety backup before restore',
        type: 'safety'
    });

    try {
        // Validate backup file
        await DatabaseUtils.validateBackup(backupPath);

        // Restore from backup
        await DatabaseUtils.restoreFromBackup(backupPath, {
            restoredBy: req.admin.username,
            safetyBackupPath
        });

        res.json({
            success: true,
            message: 'Database berhasil dipulihkan',
            data: {
                restoredFrom: filename,
                safetyBackup: path.basename(safetyBackupPath),
                restoredBy: req.admin.username,
                timestamp: new Date()
            }
        });
    } catch (error) {
        throw new ErrorResponse(
            `Gagal memulihkan database. Backup pengaman telah dibuat: ${path.basename(safetyBackupPath)}`,
            500
        );
    }
}));

/**
 * @route   GET /api/backup/list
 * @desc    Get list of available backups
 * @access  Private (Admin)
 */
router.get('/list', [protectAdmin, checkPermission('backup_restore')], asyncHandler(async (req, res) => {
    const { type, page = 1, limit = 10 } = req.query;
    
    const backups = await DatabaseUtils.listBackups({
        type,
        page: parseInt(page),
        limit: parseInt(limit)
    });

    res.json({
        success: true,
        data: backups.data,
        pagination: backups.pagination,
        message: 'Daftar backup berhasil diambil'
    });
}));

/**
 * @route   DELETE /api/backup/:filename
 * @desc    Delete a backup file
 * @access  Private (Super Admin)
 */
router.delete('/:filename', [protectAdmin, isSuperAdmin], asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const { force } = req.query;

    // Don't allow deletion of recent backups unless forced
    if (!force) {
        const backupAge = await DatabaseUtils.getBackupAge(filename);
        if (backupAge < 24 * 60 * 60 * 1000) { // 24 hours
            throw new ErrorResponse(
                'Backup terlalu baru untuk dihapus. Gunakan parameter force=true jika yakin.',
                400
            );
        }
    }

    await DatabaseUtils.deleteBackup(filename);

    res.json({
        success: true,
        message: 'Backup berhasil dihapus'
    });
}));

/**
 * @route   GET /api/backup/stats
 * @desc    Get backup statistics
 * @access  Private (Admin)
 */
router.get('/stats', [protectAdmin, checkPermission('backup_restore')], asyncHandler(async (req, res) => {
    const stats = await DatabaseUtils.getBackupStats();

    res.json({
        success: true,
        data: {
            database: {
                size: stats.databaseSize,
                collections: stats.collectionCount,
                documents: stats.documentCount
            },
            backups: {
                total: stats.backupCount,
                totalSize: stats.totalBackupSize,
                latest: stats.latestBackup,
                oldest: stats.oldestBackup,
                averageSize: stats.averageBackupSize
            },
            schedule: {
                enabled: stats.scheduleEnabled,
                nextBackup: stats.nextScheduledBackup,
                interval: stats.backupInterval
            }
        },
        message: 'Statistik backup berhasil diambil'
    });
}));

/**
 * @route   POST /api/backup/clean
 * @desc    Clean old backups
 * @access  Private (Super Admin)
 */
router.post('/clean', [protectAdmin, isSuperAdmin], asyncHandler(async (req, res) => {
    const { 
        keep = 5,
        olderThan,
        type
    } = req.body;

    const result = await DatabaseUtils.cleanOldBackups({
        keep: parseInt(keep),
        olderThan,
        type,
        cleanedBy: req.admin.username
    });

    res.json({
        success: true,
        data: {
            deletedCount: result.deletedCount,
            freedSpace: result.freedSpace,
            remainingBackups: result.remainingCount
        },
        message: `Berhasil membersihkan ${result.deletedCount} backup lama`
    });
}));

/**
 * @route   GET /api/backup/download/:filename
 * @desc    Download a backup file
 * @access  Private (Super Admin)
 */
router.get('/download/:filename', [protectAdmin, isSuperAdmin], asyncHandler(async (req, res) => {
    const { filename } = req.params;
    
    const backupPath = await DatabaseUtils.getBackupPath(filename);
    if (!backupPath) {
        throw new ErrorResponse('File backup tidak ditemukan', 404);
    }

    // Log download activity
    await DatabaseUtils.logBackupActivity({
        type: 'download',
        filename,
        admin: req.admin.username
    });

    res.download(backupPath, filename);
}));

/**
 * @route   POST /api/backup/upload
 * @desc    Upload a backup file
 * @access  Private (Super Admin)
 */
router.post('/upload', [protectAdmin, isSuperAdmin], asyncHandler(async (req, res) => {
    if (!req.files || !req.files.backup) {
        throw new ErrorResponse('File backup wajib diunggah', 400);
    }

    const result = await DatabaseUtils.handleBackupUpload(req.files.backup, {
        uploadedBy: req.admin.username
    });

    res.json({
        success: true,
        data: result,
        message: 'File backup berhasil diunggah'
    });
}));

/**
 * @route   POST /api/backup/schedule
 * @desc    Configure backup schedule
 * @access  Private (Super Admin)
 */
router.post('/schedule', [protectAdmin, isSuperAdmin], asyncHandler(async (req, res) => {
    const {
        enabled = true,
        interval = '24h',
        retention = {
            count: 10,
            days: 30
        },
        notification = {
            success: true,
            failure: true,
            email: req.admin.email
        }
    } = req.body;

    const config = await DatabaseUtils.updateBackupSchedule({
        enabled,
        interval,
        retention,
        notification,
        updatedBy: req.admin.username
    });

    res.json({
        success: true,
        data: config,
        message: 'Jadwal backup berhasil dikonfigurasi'
    });
}));

/**
 * @route   POST /api/backup/verify/:filename
 * @desc    Verify backup file integrity
 * @access  Private (Admin)
 */
router.post('/verify/:filename', [protectAdmin, checkPermission('backup_restore')], asyncHandler(async (req, res) => {
    const { filename } = req.params;

    const result = await DatabaseUtils.verifyBackup(filename);

    res.json({
        success: true,
        data: result,
        message: result.isValid 
            ? 'File backup valid dan dapat digunakan'
            : 'File backup tidak valid atau rusak'
    });
}));

module.exports = router;
