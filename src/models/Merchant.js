import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const merchantSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    phone: {
        type: String,
        required: true,
    },
    address: {
        type: String,
        required: true,
    },
    plan: {
        type: String,
        enum: ['Standard', 'Premium'],
        default: 'Standard',
    },
    bankDetails: {
        accountHolderName: { type: String }, // User typed
        accountNumber: { type: String },
        ifscCode: { type: String },
        bankName: { type: String },
        branchName: { type: String },
        verifiedName: { type: String }, // Returned from Bank Verify API
        accountType: { type: String, enum: ['Savings', 'Current'] },
        verificationStatus: { type: String, enum: ['pending', 'verified', 'failed'], default: 'pending' },
        beneficiaryId: { type: String } // For payout integration
    },
    panDetails: {
        panNumber: { type: String },
        panImage: { type: String },
        verifiedName: { type: String }, // Returned from PAN Verify API
        status: { type: String, enum: ['unverified', 'verified', 'failed'], default: 'unverified' }
    },

    role: {
        type: String,
        default: 'merchant',
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending',
    },
    paymentId: {
        type: String,
    },
    shopImages: [{
        type: String,
    }],
    resetPasswordOtp: String,
    resetPasswordExpire: Date,
}, {
    timestamps: true,
});

merchantSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

merchantSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

const Merchant = mongoose.model('Merchant', merchantSchema);

export default Merchant;
