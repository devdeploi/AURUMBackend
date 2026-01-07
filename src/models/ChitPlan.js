import mongoose from 'mongoose';

const chitPlanSchema = mongoose.Schema({
    merchant: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Merchant',
    },
    planName: {
        type: String,
        required: true,
    },
    monthlyAmount: {
        type: Number,
        required: true,
    },
    durationMonths: {
        type: Number,
        required: true,
    },
    totalAmount: {
        type: Number,
        required: true,
    },
    description: {
        type: String,
    },
    subscribers: [
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
            joinedAt: {
                type: Date,
                default: Date.now,
            },
            status: {
                type: String, // 'active', 'completed'
                default: 'active'
            }
        }
    ]
}, {
    timestamps: true,
});

const ChitPlan = mongoose.model('ChitPlan', chitPlanSchema);

export default ChitPlan;
