const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required']
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        trim: true
    },
    amount: {
        type: Number,
        required: [true, 'Amount is required'],
        validate: {
            validator: function(v) {
                return v > 0;
            },
            message: 'Budget amount must be greater than 0'
        }
    },
    period: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'yearly'],
        required: [true, 'Period is required']
    },
    startDate: {
        type: Date,
        required: [true, 'Start date is required']
    },
    endDate: {
        type: Date,
        required: [true, 'End date is required'],
        validate: {
            validator: function(v) {
                return v > this.startDate;
            },
            message: 'End date must be after start date'
        }
    },
    notifications: {
        enabled: {
            type: Boolean,
            default: true
        },
        threshold: {
            type: Number,
            default: 80, // Percentage
            min: [1, 'Threshold must be at least 1%'],
            max: [100, 'Threshold cannot exceed 100%']
        }
    },
    notes: {
        type: String,
        trim: true,
        maxlength: [500, 'Notes cannot be more than 500 characters']
    },
    isRecurring: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['active', 'paused', 'completed'],
        default: 'active'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for faster queries
budgetSchema.index({ userId: 1, category: 1 });
budgetSchema.index({ userId: 1, period: 1 });
budgetSchema.index({ startDate: 1, endDate: 1 });

// Virtual for current spending
budgetSchema.virtual('currentSpending').get(function() {
    return this._currentSpending || 0;
});

budgetSchema.virtual('remainingAmount').get(function() {
    return this.amount - (this._currentSpending || 0);
});

budgetSchema.virtual('percentageUsed').get(function() {
    return ((this._currentSpending || 0) / this.amount) * 100;
});

// Method to check if budget period is active
budgetSchema.methods.isActive = function() {
    const now = new Date();
    return now >= this.startDate && now <= this.endDate && this.status === 'active';
};

// Method to check if budget is exceeded
budgetSchema.methods.isExceeded = function() {
    return this.currentSpending > this.amount;
};

// Method to check if budget is near threshold
budgetSchema.methods.isNearThreshold = function() {
    const percentageUsed = this.percentageUsed;
    return percentageUsed >= this.notifications.threshold;
};

// Static method to get active budgets for user
budgetSchema.statics.getActiveBudgets = async function(userId) {
    const now = new Date();
    return this.find({
        userId,
        status: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now }
    });
};

// Static method to get budget summary
budgetSchema.statics.getBudgetSummary = async function(userId, date = new Date()) {
    const Transaction = mongoose.model('Transaction');
    
    // Get active budgets
    const budgets = await this.find({
        userId,
        status: 'active',
        startDate: { $lte: date },
        endDate: { $gte: date }
    });

    // Calculate current spending for each budget
    const results = await Promise.all(budgets.map(async (budget) => {
        const spending = await Transaction.aggregate([
            {
                $match: {
                    userId: mongoose.Types.ObjectId(userId),
                    category: budget.category,
                    type: 'expense',
                    date: {
                        $gte: budget.startDate,
                        $lte: date
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

        budget._currentSpending = spending.length > 0 ? spending[0].total : 0;
        return {
            budget: budget.toObject(),
            currentSpending: budget._currentSpending,
            remainingAmount: budget.remainingAmount,
            percentageUsed: budget.percentageUsed,
            isExceeded: budget.isExceeded(),
            isNearThreshold: budget.isNearThreshold()
        };
    }));

    return results;
};

// Pre-save hook to validate dates based on period
budgetSchema.pre('save', function(next) {
    if (this.isModified('period') || this.isModified('startDate')) {
        const start = new Date(this.startDate);
        
        switch(this.period) {
            case 'daily':
                this.endDate = new Date(start.setDate(start.getDate() + 1));
                break;
            case 'weekly':
                this.endDate = new Date(start.setDate(start.getDate() + 7));
                break;
            case 'monthly':
                this.endDate = new Date(start.setMonth(start.getMonth() + 1));
                break;
            case 'yearly':
                this.endDate = new Date(start.setFullYear(start.getFullYear() + 1));
                break;
        }
    }
    next();
});

module.exports = mongoose.model('Budget', budgetSchema);
