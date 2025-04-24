const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const ErrorResponse = require('../utils/errorResponse');
const { protect, protectAdmin } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');

/**
 * @route   GET /api/reports/daily
 * @desc    Get daily financial report
 * @access  Private
 */
router.get('/daily', protect, asyncHandler(async (req, res) => {
    const { date = new Date() } = req.query;
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get transactions for the day
    const transactions = await Transaction.aggregate([
        {
            $match: {
                userId: req.user._id,
                date: {
                    $gte: startOfDay,
                    $lte: endOfDay
                }
            }
        },
        {
            $group: {
                _id: {
                    hour: { $hour: '$date' },
                    type: '$type'
                },
                total: { $sum: '$amount' },
                count: { $sum: 1 },
                transactions: { $push: '$$ROOT' }
            }
        },
        {
            $group: {
                _id: '$_id.type',
                hourly: {
                    $push: {
                        hour: '$_id.hour',
                        total: '$total',
                        count: '$count',
                        transactions: '$transactions'
                    }
                },
                totalAmount: { $sum: '$total' },
                totalCount: { $sum: '$count' }
            }
        }
    ]);

    // Get category breakdown
    const categoryBreakdown = await Transaction.aggregate([
        {
            $match: {
                userId: req.user._id,
                date: {
                    $gte: startOfDay,
                    $lte: endOfDay
                }
            }
        },
        {
            $group: {
                _id: {
                    category: '$category',
                    type: '$type'
                },
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        }
    ]);

    res.json({
        success: true,
        data: {
            date: startOfDay,
            summary: {
                income: transactions.find(t => t._id === 'income') || { totalAmount: 0, totalCount: 0 },
                expense: transactions.find(t => t._id === 'expense') || { totalAmount: 0, totalCount: 0 }
            },
            hourlyBreakdown: transactions,
            categoryBreakdown
        }
    });
}));

/**
 * @route   GET /api/reports/monthly
 * @desc    Get monthly financial report
 * @access  Private
 */
router.get('/monthly', protect, asyncHandler(async (req, res) => {
    const { month = new Date().getMonth(), year = new Date().getFullYear() } = req.query;
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, parseInt(month) + 1, 0, 23, 59, 59, 999);

    // Get daily transactions for the month
    const dailyTransactions = await Transaction.aggregate([
        {
            $match: {
                userId: req.user._id,
                date: {
                    $gte: startOfMonth,
                    $lte: endOfMonth
                }
            }
        },
        {
            $group: {
                _id: {
                    date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                    type: '$type'
                },
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: '$_id.type',
                daily: {
                    $push: {
                        date: '$_id.date',
                        total: '$total',
                        count: '$count'
                    }
                },
                totalAmount: { $sum: '$total' },
                totalCount: { $sum: '$count' }
            }
        }
    ]);

    // Get category breakdown
    const categoryBreakdown = await Transaction.aggregate([
        {
            $match: {
                userId: req.user._id,
                date: {
                    $gte: startOfMonth,
                    $lte: endOfMonth
                }
            }
        },
        {
            $group: {
                _id: {
                    category: '$category',
                    type: '$type'
                },
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        }
    ]);

    // Get budget comparison
    const budgets = await Budget.find({
        userId: req.user._id,
        startDate: { $lte: endOfMonth },
        endDate: { $gte: startOfMonth }
    });

    const budgetComparison = await Promise.all(budgets.map(async (budget) => {
        const spending = await Transaction.aggregate([
            {
                $match: {
                    userId: req.user._id,
                    category: budget.category,
                    type: 'expense',
                    date: {
                        $gte: startOfMonth,
                        $lte: endOfMonth
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

        return {
            category: budget.category,
            budgeted: budget.amount,
            spent: spending.length > 0 ? spending[0].total : 0,
            remaining: budget.amount - (spending.length > 0 ? spending[0].total : 0)
        };
    }));

    res.json({
        success: true,
        data: {
            period: {
                month,
                year,
                startDate: startOfMonth,
                endDate: endOfMonth
            },
            summary: {
                income: dailyTransactions.find(t => t._id === 'income') || { totalAmount: 0, totalCount: 0 },
                expense: dailyTransactions.find(t => t._id === 'expense') || { totalAmount: 0, totalCount: 0 }
            },
            dailyBreakdown: dailyTransactions,
            categoryBreakdown,
            budgetComparison
        }
    });
}));

/**
 * @route   GET /api/reports/yearly
 * @desc    Get yearly financial report
 * @access  Private
 */
router.get('/yearly', protect, asyncHandler(async (req, res) => {
    const { year = new Date().getFullYear() } = req.query;
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

    // Get monthly transactions for the year
    const monthlyTransactions = await Transaction.aggregate([
        {
            $match: {
                userId: req.user._id,
                date: {
                    $gte: startOfYear,
                    $lte: endOfYear
                }
            }
        },
        {
            $group: {
                _id: {
                    month: { $month: '$date' },
                    type: '$type'
                },
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: '$_id.type',
                monthly: {
                    $push: {
                        month: '$_id.month',
                        total: '$total',
                        count: '$count'
                    }
                },
                totalAmount: { $sum: '$total' },
                totalCount: { $sum: '$count' }
            }
        }
    ]);

    // Get category trends
    const categoryTrends = await Transaction.aggregate([
        {
            $match: {
                userId: req.user._id,
                date: {
                    $gte: startOfYear,
                    $lte: endOfYear
                }
            }
        },
        {
            $group: {
                _id: {
                    month: { $month: '$date' },
                    category: '$category',
                    type: '$type'
                },
                total: { $sum: '$amount' }
            }
        },
        {
            $group: {
                _id: {
                    category: '$_id.category',
                    type: '$_id.type'
                },
                monthly: {
                    $push: {
                        month: '$_id.month',
                        total: '$total'
                    }
                },
                totalAmount: { $sum: '$total' }
            }
        }
    ]);

    res.json({
        success: true,
        data: {
            year,
            summary: {
                income: monthlyTransactions.find(t => t._id === 'income') || { totalAmount: 0, totalCount: 0 },
                expense: monthlyTransactions.find(t => t._id === 'expense') || { totalAmount: 0, totalCount: 0 }
            },
            monthlyBreakdown: monthlyTransactions,
            categoryTrends
        }
    });
}));

/**
 * @route   GET /api/reports/trends
 * @desc    Get spending trends and patterns
 * @access  Private
 */
router.get('/trends', protect, asyncHandler(async (req, res) => {
    const { months = 12 } = req.query;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    // Get spending patterns
    const spendingPatterns = await Transaction.aggregate([
        {
            $match: {
                userId: req.user._id,
                type: 'expense',
                date: {
                    $gte: startDate,
                    $lte: endDate
                }
            }
        },
        {
            $group: {
                _id: {
                    month: { $month: '$date' },
                    year: { $year: '$date' },
                    category: '$category'
                },
                total: { $sum: '$amount' },
                average: { $avg: '$amount' },
                count: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: '$_id.category',
                monthly: {
                    $push: {
                        month: '$_id.month',
                        year: '$_id.year',
                        total: '$total',
                        average: '$average',
                        count: '$count'
                    }
                },
                totalSpent: { $sum: '$total' },
                averagePerMonth: { $avg: '$total' }
            }
        },
        { $sort: { totalSpent: -1 } }
    ]);

    res.json({
        success: true,
        data: {
            period: {
                startDate,
                endDate,
                months
            },
            spendingPatterns
        }
    });
}));

/**
 * @route   GET /api/reports/admin/overview
 * @desc    Get admin overview report
 * @access  Private (Admin)
 */
router.get('/admin/overview', protectAdmin, asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    const query = {};
    if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
    }

    // Get overall statistics
    const stats = await Transaction.aggregate([
        { $match: query },
        {
            $group: {
                _id: '$type',
                total: { $sum: '$amount' },
                count: { $sum: 1 },
                avgAmount: { $avg: '$amount' }
            }
        }
    ]);

    // Get top spending categories
    const topCategories = await Transaction.aggregate([
        {
            $match: {
                ...query,
                type: 'expense'
            }
        },
        {
            $group: {
                _id: '$category',
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        },
        { $sort: { total: -1 } },
        { $limit: 5 }
    ]);

    res.json({
        success: true,
        data: {
            stats,
            topCategories
        }
    });
}));

module.exports = router;
