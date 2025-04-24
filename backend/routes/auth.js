const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');
const ErrorResponse = require('../utils/errorResponse');
const ActivationUtils = require('../utils/activationUtils');
const { protect, protectAdmin } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');

/**
 * @route   POST /api/auth/login
 * @desc    Login user with username and activation code
 * @access  Public
 */
router.post('/login', asyncHandler(async (req, res) => {
    const { username, activationCode } = req.body;

    // Validate input
    if (!username || !activationCode) {
        throw new ErrorResponse('Please provide username and activation code', 400);
    }

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
        throw new ErrorResponse('Invalid credentials', 401);
    }

    // Check if user is active
    if (user.status !== 'active') {
        throw new ErrorResponse('User account is not active', 401);
    }

    // Verify activation code
    const isMatch = await user.matchActivationCode(activationCode);
    if (!isMatch) {
        throw new ErrorResponse('Invalid activation code', 401);
    }

    // Check if activation is expired
    if (user.isActivationExpired) {
        throw new ErrorResponse('Activation code has expired', 401);
    }

    // Generate token
    const token = user.getSignedJwtToken();

    res.json({
        success: true,
        token,
        user: {
            id: user._id,
            username: user.username,
            status: user.status,
            allowedPhones: user.allowedPhones,
            balance: user.balance
        }
    });
}));

/**
 * @route   POST /api/auth/admin/login
 * @desc    Login admin with username and password
 * @access  Public
 */
router.post('/admin/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
        throw new ErrorResponse('Please provide username and password', 400);
    }

    // Find admin and include password
    const admin = await Admin.findOne({ username }).select('+password');
    if (!admin) {
        throw new ErrorResponse('Invalid credentials', 401);
    }

    // Check if admin is active
    if (admin.status !== 'active') {
        throw new ErrorResponse('Admin account is not active', 401);
    }

    // Check if account is locked
    if (admin.isLocked()) {
        throw new ErrorResponse('Account is temporarily locked', 423);
    }

    // Verify password
    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
        // Increment login attempts
        await admin.incrementLoginAttempts();
        throw new ErrorResponse('Invalid credentials', 401);
    }

    // Reset login attempts on successful login
    await admin.resetLoginAttempts();

    // Check if password change is required
    if (admin.needsPasswordChange()) {
        throw new ErrorResponse('Password change required', 426);
    }

    // Generate token
    const token = admin.getSignedJwtToken();

    res.json({
        success: true,
        token,
        admin: {
            id: admin._id,
            username: admin.username,
            role: admin.role,
            permissions: admin.permissions
        }
    });
}));

/**
 * @route   POST /api/auth/admin/change-password
 * @desc    Change admin password
 * @access  Private (Admin)
 */
router.post('/admin/change-password', protectAdmin, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
        throw new ErrorResponse('Please provide current and new password', 400);
    }

    // Get admin with password
    const admin = await Admin.findById(req.admin.id).select('+password');

    // Verify current password
    const isMatch = await admin.matchPassword(currentPassword);
    if (!isMatch) {
        throw new ErrorResponse('Current password is incorrect', 401);
    }

    // Update password
    admin.password = newPassword;
    admin.securitySettings.requirePasswordChange = false;
    admin.securitySettings.lastPasswordChange = Date.now();
    await admin.save();

    res.json({
        success: true,
        message: 'Password updated successfully'
    });
}));

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', protect, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    
    res.json({
        success: true,
        data: {
            id: user._id,
            username: user.username,
            status: user.status,
            allowedPhones: user.allowedPhones,
            balance: user.balance,
            activation: {
                isActive: user.activation.isActive,
                expiryDate: user.activation.expiryDate,
                remaining: ActivationUtils.getRemainingTime(user.activation.expiryDate)
            }
        }
    });
}));

/**
 * @route   GET /api/auth/admin/me
 * @desc    Get current admin profile
 * @access  Private (Admin)
 */
router.get('/admin/me', protectAdmin, asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.admin.id);
    
    res.json({
        success: true,
        data: {
            id: admin._id,
            username: admin.username,
            role: admin.role,
            permissions: admin.permissions,
            lastLogin: admin.lastLogin,
            status: admin.status
        }
    });
}));

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user/admin (optional: blacklist token)
 * @access  Private
 */
router.post('/logout', asyncHandler(async (req, res) => {
    // Here you might want to implement token blacklisting if needed
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
}));

module.exports = router;
