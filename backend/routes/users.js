const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const ActivationUtils = require('../utils/activationUtils');
const WhatsAppUtils = require('../utils/whatsappUtils');
const { protectAdmin, checkPermission } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');

/**
 * @route   POST /api/users
 * @desc    Create a new user with activation code
 * @access  Private (Admin)
 */
router.post('/', protectAdmin, checkPermission('manage_users'), asyncHandler(async (req, res) => {
    const { username, phoneNumber, duration = '7d', maxPhones = 1 } = req.body;

    // Validate request
    const validatedData = ActivationUtils.validateActivationRequest({
        username,
        phoneNumber,
        duration
    });

    // Check if username exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
        throw new ErrorResponse('Username already exists', 400);
    }

    // Check if phone number is already registered
    const phoneExists = await User.findOne({
        'allowedPhones.number': validatedData.phoneNumber
    });
    if (phoneExists) {
        throw new ErrorResponse('Phone number already registered', 400);
    }

    // Verify phone number exists on WhatsApp
    const isWhatsAppNumber = await WhatsAppUtils.checkNumberExists(validatedData.phoneNumber);
    if (!isWhatsAppNumber) {
        throw new ErrorResponse('Phone number not registered on WhatsApp', 400);
    }

    // Create user
    const user = await User.create({
        username: validatedData.username,
        activation: {
            code: validatedData.activationCode,
            expiryDate: validatedData.expiryDate,
            isActive: true
        },
        allowedPhones: [{
            number: validatedData.phoneNumber,
            isActive: true
        }],
        maxPhones,
        status: 'active'
    });

    res.status(201).json({
        success: true,
        data: {
            user: {
                id: user._id,
                username: user.username,
                status: user.status,
                maxPhones: user.maxPhones
            },
            activation: {
                code: validatedData.activationCode, // Send plain code only in response
                expiryDate: user.activation.expiryDate
            }
        }
    });
}));

/**
 * @route   GET /api/users
 * @desc    Get all users
 * @access  Private (Admin)
 */
router.get('/', protectAdmin, checkPermission('manage_users'), asyncHandler(async (req, res) => {
    const { status, search, page = 1, limit = 10 } = req.query;

    // Build query
    const query = {};
    if (status) query.status = status;
    if (search) {
        query.$or = [
            { username: { $regex: search, $options: 'i' } },
            { 'allowedPhones.number': { $regex: search, $options: 'i' } }
        ];
    }

    // Execute query with pagination
    const users = await User.find(query)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .select('-activation.code');

    // Get total count
    const total = await User.countDocuments(query);

    res.json({
        success: true,
        data: users,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    });
}));

/**
 * @route   GET /api/users/:id
 * @desc    Get single user
 * @access  Private (Admin)
 */
router.get('/:id', protectAdmin, checkPermission('manage_users'), asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-activation.code');
    
    if (!user) {
        throw new ErrorResponse('User not found', 404);
    }

    res.json({
        success: true,
        data: user
    });
}));

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Private (Admin)
 */
router.put('/:id', protectAdmin, checkPermission('manage_users'), asyncHandler(async (req, res) => {
    const { status, maxPhones } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
        throw new ErrorResponse('User not found', 404);
    }

    // Update fields if provided
    if (status) user.status = status;
    if (maxPhones) user.maxPhones = maxPhones;

    await user.save();

    res.json({
        success: true,
        data: user
    });
}));

/**
 * @route   POST /api/users/:id/phones
 * @desc    Add phone number to user
 * @access  Private (Admin)
 */
router.post('/:id/phones', protectAdmin, checkPermission('manage_users'), asyncHandler(async (req, res) => {
    const { phoneNumber } = req.body;

    // Validate phone number
    if (!ActivationUtils.isValidPhoneNumber(phoneNumber)) {
        throw new ErrorResponse('Invalid phone number format', 400);
    }

    const user = await User.findById(req.params.id);
    if (!user) {
        throw new ErrorResponse('User not found', 404);
    }

    // Check if number already registered
    const phoneExists = await User.findOne({
        'allowedPhones.number': phoneNumber
    });
    if (phoneExists) {
        throw new ErrorResponse('Phone number already registered', 400);
    }

    // Verify WhatsApp number
    const isWhatsAppNumber = await WhatsAppUtils.checkNumberExists(phoneNumber);
    if (!isWhatsAppNumber) {
        throw new ErrorResponse('Phone number not registered on WhatsApp', 400);
    }

    // Add phone number
    user.addPhone(phoneNumber);
    await user.save();

    res.json({
        success: true,
        data: user
    });
}));

/**
 * @route   DELETE /api/users/:id/phones/:phone
 * @desc    Remove phone number from user
 * @access  Private (Admin)
 */
router.delete('/:id/phones/:phone', protectAdmin, checkPermission('manage_users'), asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
        throw new ErrorResponse('User not found', 404);
    }

    // Remove phone number
    user.allowedPhones = user.allowedPhones.filter(
        phone => phone.number !== req.params.phone
    );
    await user.save();

    res.json({
        success: true,
        data: user
    });
}));

/**
 * @route   POST /api/users/:id/extend
 * @desc    Extend user activation
 * @access  Private (Admin)
 */
router.post('/:id/extend', protectAdmin, checkPermission('manage_users'), asyncHandler(async (req, res) => {
    const { duration } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
        throw new ErrorResponse('User not found', 404);
    }

    // Calculate new expiry date
    const newExpiryDate = ActivationUtils.calculateExpiryDate(duration);

    // Generate new activation code
    const newActivationCode = ActivationUtils.generateActivationCode();

    // Update user
    user.activation = {
        code: newActivationCode,
        expiryDate: newExpiryDate,
        isActive: true
    };

    await user.save();

    res.json({
        success: true,
        data: {
            activationCode: newActivationCode,
            expiryDate: newExpiryDate
        }
    });
}));

module.exports = router;
