const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required']
    },
    type: {
        type: String,
        enum: ['income', 'expense'],
        required: [true, 'Transaction type is required']
    },
    amount: {
        type: Number,
        required: [true, 'Amount is required'],
        validate: {
            validator: function(v) {
                return v > 0;
            },
            message: 'Amount must be greater than 0'
        }
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true,
        maxlength: [500, 'Description cannot be more than 500 characters']
    },
    date: {
        type: Date,
        default: Date.now,
        required: [true, 'Date is required']
    },
    source: {
        type: String,
        required: [true, 'Source is required'],
        trim: true,
        validate: {
            validator: function(v) {
                // Basic phone number validation for WhatsApp source
                return /^\+?[\d\s-]+$/.test(v) || v === 'manual';
            },
            message: 'Invalid source format'
        }
    },
    tags: [{
        type: String,
        trim: true
    }],
    attachments: [{
        type: String, // URLs or file paths
        trim: true
    }],
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            default: [0, 0]
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Add indexes for faster queries
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, type: 1 });
transactionSchema.index({ userId: 1, category: 1 });
transactionSchema.index({ source: 1 });
transactionSchema.index({ location: '2dsphere' });

// Virtual for formatted amount
transactionSchema.virtual('formattedAmount').get(function() {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR'
    }).format(this.amount);
});

// Virtual for formatted date
transactionSchema.virtual('formattedDate').get(function() {
    return this.date.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
});

// Static method to get total by type
transactionSchema.statics.getTotalByType = async function(userId, type, startDate, endDate) {
    const match = {
        userId,
        type,
        date: {
            $gte: startDate,
            $lte: endDate
        }
    };

    const result = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                total: { $sum: '$amount' }
            }
        }
    ]);

    return result.length > 0 ? result[0].total : 0;
};

// Static method to get category summary
transactionSchema.statics.getCategorySummary = async function(userId, startDate, endDate) {
    return await this.aggregate([
        {
            $match: {
                userId,
                date: {
                    $gte: startDate,
                    $lte: endDate
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
};

// Middleware to update user balance after transaction
transactionSchema.post('save', async function(doc) {
    const User = mongoose.model('User');
    const user = await User.findById(doc.userId);
    
    if (user) {
        const amount = doc.type === 'income' ? doc.amount : -doc.amount;
        user.balance += amount;
        await user.save();
    }
});

module.exports = mongoose.model('Transaction', transactionSchema);
