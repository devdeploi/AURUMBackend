import mongoose from 'mongoose';

const paymentSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User',
    },
    merchant: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Merchant',
    },
    chitPlan: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'ChitPlan',
    },
    amount: {
        type: Number,
        required: true,
    },
    paymentId: {
        type: String, // PayPal transaction ID
        required: true,
    },
    status: {
        type: String,
        default: 'Pending', // Pending, Completed, Failed
    },
    paymentDate: {
        type: Date,
        default: Date.now,
    },
    paymentDetails: {
        type: Object, // Store full PayPal response
    }
}, {
    timestamps: true,
});

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
