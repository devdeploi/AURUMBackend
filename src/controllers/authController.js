import User from '../models/User.js';
import Merchant from '../models/Merchant.js';
import generateToken from '../utils/generateToken.js';
import { encrypt } from '../utils/encryption.js';
import sendEmail from '../utils/sendEmail.js';

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
const authUser = async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id),
        });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
};

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
const registerUser = async (req, res) => {
    const { name, email, password, phone, address } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
        res.status(400).json({ message: 'User already exists' });
        return;
    }

    const user = await User.create({
        name,
        email,
        password,
        phone,
        address
    });

    if (user) {
        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id),
        });
    } else {
        res.status(400).json({ message: 'Invalid user data' });
    }
};

// @desc    Auth merchant & get token
// @route   POST /api/merchants/login
// @access  Public
const authMerchant = async (req, res) => {
    const { email, password } = req.body;

    const merchant = await Merchant.findOne({ email });

    if (merchant && (await merchant.matchPassword(password))) {
        if (merchant.status === 'Rejected') {
            res.status(401).json({ message: `Your account is ${merchant.status || 'Rejected'}. Please contact Admin for Refund.` });
            return;
        }
        if (merchant.status !== 'Approved') {
            res.status(401).json({ message: `Your account is ${merchant.status || 'Pending'}. Please wait for Admin approval.` });
            return;
        }

        res.json({
            _id: merchant._id,
            name: merchant.name,
            email: merchant.email,
            role: merchant.role,
            plan: merchant.plan,
            token: generateToken(merchant._id),
        });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
};

// @desc    Register a new merchant
// @route   POST /api/merchants
// @access  Public
const registerMerchant = async (req, res) => {
    const {
        name, email, password, phone, address, plan, paymentId,
        bankDetails, shopImages, panDetails
    } = req.body;

    const merchantExists = await Merchant.findOne({ email });

    if (merchantExists) {
        res.status(400).json({ message: 'Merchant already exists' });
        return;
    }

    const merchant = await Merchant.create({
        name,
        email,
        password,
        phone,
        address,
        plan,
        paymentId,
        shopImages, // Save shop images
        // Save bankDetails directly
        bankDetails: bankDetails || {},
        panDetails: panDetails || {}
    });

    if (merchant) {
        res.status(201).json({
            _id: merchant._id,
            name: merchant.name,
            email: merchant.email,
            role: merchant.role,
            plan: merchant.plan,
            token: generateToken(merchant._id),
        });
    } else {
        res.status(400).json({ message: 'Invalid merchant data' });
    }
};

const forgotPassword = async (req, res) => {
    const { email } = req.body;
    let user = await User.findOne({ email });

    if (!user) {
        user = await Merchant.findOne({ email });
    }

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetPasswordOtp = otp;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    const message = `Your password reset OTP is ${otp}`;

    try {
        await sendEmail({
            email: user.email,
            subject: 'Password Reset OTP',
            message,
        });

        res.status(200).json({ message: 'OTP sent to email' });
    } catch (error) {
        user.resetPasswordOtp = undefined;
        user.resetPasswordExpire = undefined;
        await user.save({ validateBeforeSave: false });
        res.status(500).json({ message: 'Email could not be sent' });
    }
};

const resetPassword = async (req, res) => {
    const { email, otp, newPassword } = req.body;

    let user = await User.findOne({ email });

    if (!user) {
        user = await Merchant.findOne({ email });
    }

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    if (user.resetPasswordOtp === otp && user.resetPasswordExpire > Date.now()) {
        user.password = newPassword;
        user.resetPasswordOtp = undefined;
        user.resetPasswordExpire = undefined;

        await user.save();

        res.status(200).json({ message: 'Password reset successful' });
    } else {
        res.status(400).json({ message: 'Invalid OTP or expired' });
    }
};

const verifyOtp = async (req, res) => {
    const { email, otp } = req.body;

    let user = await User.findOne({ email });

    if (!user) {
        user = await Merchant.findOne({ email });
    }

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    if (user.resetPasswordOtp === otp && user.resetPasswordExpire > Date.now()) {
        res.status(200).json({ message: 'OTP verified' });
    } else {
        res.status(400).json({ message: 'Invalid OTP or expired' });
    }
};

// @desc    Check if email exists
// @route   POST /api/check-email
// @access  Public
const checkEmailExists = async (req, res) => {
    const { email } = req.body;

    // Check in both User and Merchant collections
    const userExists = await User.findOne({ email });
    const merchantExists = await Merchant.findOne({ email });

    if (userExists || merchantExists) {
        return res.json({ exists: true, message: 'Email already registered' });
    } else {
        return res.json({ exists: false });
    }
};

export { authUser, registerUser, authMerchant, registerMerchant, checkEmailExists, forgotPassword, resetPassword, verifyOtp };
