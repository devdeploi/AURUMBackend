import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { encrypt } from '../utils/encryption.js';

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
    encryptedPassword: {
        type: String,
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
    billingCycle: {
        type: String,
        enum: ['monthly', 'yearly'],
        default: 'monthly',
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
    gstin: {
        type: String,
    },
    addressProof: {
        type: String,
    },
    legalName: {
        type: String,
    },
    panNumber: {
        type: String,
    },

    role: {
        type: String,
        default: 'merchant',
    },
    fcmToken: {
        type: String,
        required: false,
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending',
    },
    paymentId: {
        type: String,
    },
    razorpayAccountId: {
        type: String,
    },
    subscriptionStartDate: {
        type: Date,
    },
    subscriptionExpiryDate: {
        type: Date,
    },
    subscriptionStatus: {
        type: String,
        enum: ['active', 'expired', 'cancelled'],
        default: 'active', // Will be managed based on dates
    },
    shopImages: [{
        type: String,
    }],
    shopLogo: {
        type: String,
    },
    resetPasswordOtp: String,
    resetPasswordExpire: Date,
    loginOtp: String,
    loginOtpExpire: Date,
    upcomingPlan: {
        type: String,
        enum: ['Standard', 'Premium'],
    },
    planSwitchDate: {
        type: Date,
    },
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

    // Store encrypted password for retrieval
    this.encryptedPassword = encrypt(this.password);

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

const Merchant = mongoose.model('Merchant', merchantSchema);

export default Merchant;
