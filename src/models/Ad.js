import mongoose from 'mongoose';

const adSchema = mongoose.Schema({
    merchant: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Merchant',
    },
    imageUrls: [{
        type: String,
        required: true,
    }],
    link: {
        type: String,
        required: false,
    },
    title: {
        type: String,
        required: false
    },
    description: {
        type: String,
        required: false
    },
    displayFrequency: {
        type: Number, // in minutes
        default: 15
    },
    startDate: {
        type: Date,
        required: true,
    },
    endDate: {
        type: Date,
        required: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    }
}, {
    timestamps: true,
});

// Index for efficient querying of active ads
adSchema.index({ startDate: 1, endDate: 1, isActive: 1 });

const Ad = mongoose.model('Ad', adSchema);

export default Ad;
