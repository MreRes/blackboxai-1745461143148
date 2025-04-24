const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const { protect, protectAdmin, validateWhatsAppSource } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');

/**
 * @route   POST /api/transactions
 * @desc    Create new transaction
 * @access  Private
 */
router.post('/', protect, asyncHandler(async (req, res) => {
    const { type, amount, category, description, date, source } = req.body;

    // Validate required fields
    if (!type || !amount || !category || !description) {
        throw new ErrorResponse('Please provide all required fields', 400);
    }

    // Create transaction
    const transaction = await Transaction.create({
        userId: req.user.id,
        type,
        amount,
        category,
        description,
        date: date || Date.now(),
        source: source || 'manual'
    });

    res.status(201).json({
        success: true,
        data: transaction
    });
}));

/**
 * @route   POST /api/transactions/whatsapp
 * @desc    Create transaction from WhatsApp
 * @access  Private (WhatsApp Source)
 */
router.post('/whatsapp', validateWhatsAppSource, asyncHandler(async (req, res) => {
    const { type, amount, category, description } = req.body;

    // Create transaction
    const transaction = await Transaction.create({
        userId: req.user.id,
        type,
        amount,
        category,
        description,
        source: req.phoneNumber
    });

    res.status(201).json({
        success: true,
        data: transaction
    });
}));

/**
 * @route   GET /api/transactions
 * @desc    Get all transactions with filters
 * @access  Private
 */
router.get('/', protect, asyncHandler(async (req, res) => {
    const {
        type,
        category,
        startDate,
        endDate,
        source,
        minAmount,
        maxAmount,
        page = 1,
        limit = 10,
        sort = '-date'
    } = req.query;

    // Build query
    const query = { userId: req.user.id };
    
    if (type) query.type = type;
    if (category) query.category = category;
    if (source) query.source = source;
    
    // Date range
    if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
    }

    // Amount range
    if (minAmount || maxAmount) {
        query.amount = {};
        if (minAmount) query.amount.$gte = Number(minAmount);
        if (maxAmount) query.amount.$lte = Number(maxAmount);
    }

    // Execute query with pagination
    const transactions = await Transaction.find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    // Get total count
    const total = await Transaction.countDocuments(query);

    // Get summary
    const summary = await Transaction.aggregate([
        { $match: query },
        {
            $group: {
                _id: '$type',
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        }
    ]);

    res.json({
        success: true,
        data: transactions,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        },
        summary: {
            income: summary.find(s => s._id === 'income') || { total: 0, count: 0 },
            expense: summary.find(s => s._id === 'expense') || { total: 0, count: 0 }
        }
    });
}));

/**
 * @route   GET /api/transactions/:id
 * @desc    Get single transaction
 * @access  Private
 */
router.get('/:id', protect, asyncHandler(async (req, res) => {
    const transaction = await Transaction.findOne({
        _id: req.params.id,
        userId: req.user.id
    });

    if (!transaction) {
        throw new ErrorResponse('Transaction not found', 404);
    }

    res.json({
        success: true,
        data: transaction
    });
}));

/**
 * @route   PUT /api/transactions/:id
 * @desc    Update transaction
 * @access  Private
 */
router.put('/:id', protect, asyncHandler(async (req, res) => {
    const { type, amount, category, description, date } = req.body;

    let transaction = await Transaction.findOne({
        _id: req.params.id,
        userId: req.user.id
    });

    if (!transaction) {
        throw new ErrorResponse('Transaction not found', 404);
    }

    // Update fields
    transaction.type = type || transaction.type;
    transaction.amount = amount || transaction.amount;
    transaction.category = category || transaction.category;
    transaction.description = description || transaction.description;
    transaction.date = date || transaction.date;

    await transaction.save();

    res.json({
        success: true,
        data: transaction
    });
}));

/**
 * @route   DELETE /api/transactions/:id
 * @desc    Delete transaction
 * @access  Private
 */
router.delete('/:id', protect, asyncHandler(async (req, res) => {
    const transaction = await Transaction.findOne({
        _id: req.params.id,
        userId: req.user.id
    });

    if (!transaction) {
        throw new ErrorResponse('Transaction not found', 404);
    }

    await transaction.remove();

    res.json({
        success: true,
        data: {}
    });
}));

/**
 * @route   GET /api/transactions/summary/category
 * @desc    Get transactions summary by category
 * @access  Private
 */
router.get('/summary/category', protect, asyncHandler(async (req, res) => {
    const { startDate, endDate, type } = req.query;

    const query = { userId: req.user.id };
    if (type) query.type = type;
    if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
    }

    const summary = await Transaction.aggregate([
        { $match: query },
        {
            $group: {
                _id: {
                    category: '$category',
                    type: '$type'
                },
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: '$_id.type',
                categories: {
                    $push: {
                        name: '$_id.category',
                        total: '$total',
                        count: '$count'
                    }
                }
            }
        }
    ]);

    res.json({
        success: true,
        data: summary
    });
}));

/**
 * @route   GET /api/transactions/admin/all
 * @desc    Get all transactions (admin)
 * @access  Private (Admin)
 */
router.get('/admin/all', protectAdmin, asyncHandler(async (req, res) => {
    const { userId, type, startDate, endDate, page = 1, limit = 10 } = req.query;

    const query = {};
    if (userId) query.userId = userId;
    if (type) query.type = type;
    if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
        .populate('userId', 'username')
        .sort('-date')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await Transaction.countDocuments(query);

    res.json({
        success: true,
        data: transactions,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    });
}));

module.exports = router;
