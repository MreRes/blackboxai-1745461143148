const express = require('express');
const router = express.Router();
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const ErrorResponse = require('../utils/errorResponse');
const { protect, protectAdmin } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');

/**
 * @route   POST /api/budget
 * @desc    Create new budget
 * @access  Private
 */
router.post('/', protect, asyncHandler(async (req, res) => {
    const { category, amount, period, startDate } = req.body;

    // Validate required fields
    if (!category || !amount || !period) {
        throw new ErrorResponse('Please provide all required fields', 400);
    }

    // Check for existing budget in same period
    const existingBudget = await Budget.findOne({
        userId: req.user.id,
        category,
        startDate: { $lte: startDate || new Date() },
        endDate: { $gte: startDate || new Date() }
    });

    if (existingBudget) {
        throw new ErrorResponse('Budget already exists for this period', 400);
    }

    // Create budget
    const budget = await Budget.create({
        userId: req.user.id,
        category,
        amount,
        period,
        startDate: startDate || new Date(),
        status: 'active'
    });

    res.status(201).json({
        success: true,
        data: budget
    });
}));

/**
 * @route   GET /api/budget
 * @desc    Get all budgets with current spending
 * @access  Private
 */
router.get('/', protect, asyncHandler(async (req, res) => {
    const { period, active } = req.query;
    const now = new Date();

    // Build query
    const query = { userId: req.user.id };
    if (period) query.period = period;
    if (active === 'true') {
        query.startDate = { $lte: now };
        query.endDate = { $gte: now };
        query.status = 'active';
    }

    // Get budgets
    const budgets = await Budget.find(query).sort('-startDate');

    // Calculate current spending for each budget
    const budgetSummary = await Promise.all(budgets.map(async (budget) => {
        const spending = await Transaction.aggregate([
            {
                $match: {
                    userId: req.user.id,
                    category: budget.category,
                    type: 'expense',
                    date: {
                        $gte: budget.startDate,
                        $lte: budget.endDate
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' }
                }
            }
        ]);

        const currentSpending = spending.length > 0 ? spending[0].total : 0;
        const remainingAmount = budget.amount - currentSpending;
        const percentageUsed = (currentSpending / budget.amount) * 100;

        return {
            ...budget.toObject(),
            currentSpending,
            remainingAmount,
            percentageUsed,
            isExceeded: currentSpending > budget.amount,
            isNearThreshold: percentageUsed >= budget.notifications.threshold
        };
    }));

    res.json({
        success: true,
        data: budgetSummary
    });
}));

/**
 * @route   GET /api/budget/:id
 * @desc    Get single budget with spending details
 * @access  Private
 */
router.get('/:id', protect, asyncHandler(async (req, res) => {
    const budget = await Budget.findOne({
        _id: req.params.id,
        userId: req.user.id
    });

    if (!budget) {
        throw new ErrorResponse('Budget not found', 404);
    }

    // Get spending details
    const spending = await Transaction.aggregate([
        {
            $match: {
                userId: req.user.id,
                category: budget.category,
                type: 'expense',
                date: {
                    $gte: budget.startDate,
                    $lte: budget.endDate
                }
            }
        },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: '%Y-%m-%d',
                        date: '$date'
                    }
                },
                total: { $sum: '$amount' },
                transactions: { $push: '$$ROOT' }
            }
        },
        { $sort: { '_id': 1 } }
    ]);

    const totalSpent = spending.reduce((acc, day) => acc + day.total, 0);

    res.json({
        success: true,
        data: {
            budget: budget.toObject(),
            spending: {
                daily: spending,
                total: totalSpent,
                remaining: budget.amount - totalSpent,
                percentageUsed: (totalSpent / budget.amount) * 100
            }
        }
    });
}));

/**
 * @route   PUT /api/budget/:id
 * @desc    Update budget
 * @access  Private
 */
router.put('/:id', protect, asyncHandler(async (req, res) => {
    const { amount, notifications, status } = req.body;

    const budget = await Budget.findOne({
        _id: req.params.id,
        userId: req.user.id
    });

    if (!budget) {
        throw new ErrorResponse('Budget not found', 404);
    }

    // Update fields
    if (amount) budget.amount = amount;
    if (notifications) budget.notifications = { ...budget.notifications, ...notifications };
    if (status) budget.status = status;

    await budget.save();

    res.json({
        success: true,
        data: budget
    });
}));

/**
 * @route   DELETE /api/budget/:id
 * @desc    Delete budget
 * @access  Private
 */
router.delete('/:id', protect, asyncHandler(async (req, res) => {
    const budget = await Budget.findOne({
        _id: req.params.id,
        userId: req.user.id
    });

    if (!budget) {
        throw new ErrorResponse('Budget not found', 404);
    }

    await budget.remove();

    res.json({
        success: true,
        data: {}
    });
}));

/**
 * @route   GET /api/budget/summary/overview
 * @desc    Get budget overview summary
 * @access  Private
 */
router.get('/summary/overview', protect, asyncHandler(async (req, res) => {
    const now = new Date();

    // Get active budgets
    const activeBudgets = await Budget.find({
        userId: req.user.id,
        startDate: { $lte: now },
        endDate: { $gte: now },
        status: 'active'
    });

    // Calculate spending for each budget
    const budgetOverview = await Promise.all(activeBudgets.map(async (budget) => {
        const spending = await Transaction.aggregate([
            {
                $match: {
                    userId: req.user.id,
                    category: budget.category,
                    type: 'expense',
                    date: {
                        $gte: budget.startDate,
                        $lte: now
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' }
                }
            }
        ]);

        const spent = spending.length > 0 ? spending[0].total : 0;

        return {
            category: budget.category,
            budgeted: budget.amount,
            spent,
            remaining: budget.amount - spent,
            percentageUsed: (spent / budget.amount) * 100
        };
    }));

    // Calculate totals
    const totals = budgetOverview.reduce((acc, curr) => ({
        budgeted: acc.budgeted + curr.budgeted,
        spent: acc.spent + curr.spent,
        remaining: acc.remaining + curr.remaining
    }), { budgeted: 0, spent: 0, remaining: 0 });

    res.json({
        success: true,
        data: {
            budgets: budgetOverview,
            totals
        }
    });
}));

/**
 * @route   GET /api/budget/admin/all
 * @desc    Get all budgets (admin)
 * @access  Private (Admin)
 */
router.get('/admin/all', protectAdmin, asyncHandler(async (req, res) => {
    const { userId, status, page = 1, limit = 10 } = req.query;

    const query = {};
    if (userId) query.userId = userId;
    if (status) query.status = status;

    const budgets = await Budget.find(query)
        .populate('userId', 'username')
        .sort('-startDate')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await Budget.countDocuments(query);

    res.json({
        success: true,
        data: budgets,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    });
}));

module.exports = router;
