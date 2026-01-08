import User from '../models/User.js';
import Merchant from '../models/Merchant.js';
import Verification from '../models/Verification.js';
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

        // Direct Login - No OTP needed for password login
        res.json({
            _id: merchant._id,
            name: merchant.name,
            email: merchant.email,
            role: merchant.role,
            plan: merchant.plan,
            token: generateToken(merchant._id),
            otpSent: false
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
        bankDetails, shopImages, gstin, addressProof
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
        gstin,
        addressProof
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

        const emailTemplate = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; width: 100%; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff; overflow: hidden;">
            <div style="text-align: center; padding: 30px 20px; background-color: #ffffff;">
                <div style="font-size: 48px; margin-bottom: 10px;">💎</div>
                <h1 style="color: #915200; font-size: 26px; margin: 0; font-weight: 800; letter-spacing: -0.5px;">AURUM</h1>
                <p style="color: #888; font-size: 13px; margin: 5px 0 0; text-transform: uppercase; letter-spacing: 1px;">Premium Jewelry Management</p>
            </div>
            
            <div style="padding: 0 20px 30px 20px;">
                <div style="background-color: #f8f9fa; padding: 30px 20px; border-radius: 12px; border: 1px solid #e9ecef;">
                    <h2 style="color: #333; margin-top: 0; font-size: 22px;">Welcome to Aurum! 🎉</h2>
                    <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">Dear <strong>${merchant.name}</strong>,</p>
                    <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">Thank you for registering. Your application is <strong>Under Review</strong>.</p>
                    
                    <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border: 1px dashed #ced4da; margin: 25px 0;">
                        <h3 style="color: #915200; margin: 0 0 15px 0; font-size: 16px; text-transform: uppercase;">Registration Details</h3>
                        <p style="margin: 8px 0; color: #4a5568; font-size: 14px;"><strong>Plan:</strong> ${merchant.plan}</p>
                        <p style="margin: 8px 0; color: #4a5568; font-size: 14px;"><strong>Email:</strong> ${merchant.email}</p>
                        <p style="margin: 8px 0; color: #4a5568; font-size: 14px;"><strong>Status:</strong> <span style="background-color: #fff3cd; color: #856404; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">Pending Approval</span></p>
                    </div>

                    <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">We will notify you by email once your account is active.</p>
                </div>
            </div>

            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #a0aec0; font-size: 12px; border-top: 1px solid #edf2f7;">
                <p style="margin: 0;">If you have questions, please contact support.</p>
                <p style="margin: 5px 0 0;">&copy; ${new Date().getFullYear()} AURUM. All rights reserved.</p>
            </div>
        </div>
        `;

        try {
            await sendEmail({
                email: merchant.email,
                subject: '🎉 Registration Received - AURUM',
                message: `Welcome to AURUM. Your registration for ${merchant.plan} plan is received.`,
                html: emailTemplate
            });
        } catch (error) {
            console.error('Registration email failed:', error);
        }
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
        return res.status(404).json({ message: 'Email not registered' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetPasswordOtp = otp;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    const message = `Your password reset OTP is ${otp}`;

    const emailTemplate = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; width: 100%; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff; overflow: hidden;">
        <div style="text-align: center; padding: 30px 20px; background-color: #ffffff;">
            <div style="font-size: 48px; margin-bottom: 10px;">💎</div>
            <h1 style="color: #915200; font-size: 26px; margin: 0; font-weight: 800; letter-spacing: -0.5px;">AURUM</h1>
            <p style="color: #888; font-size: 13px; margin: 5px 0 0; text-transform: uppercase; letter-spacing: 1px;">Premium Jewelry Management</p>
        </div>
        
        <div style="padding: 0 20px 30px 20px;">
            <div style="background-color: #fff8f0; padding: 30px 20px; border-radius: 12px; border: 1px solid #f0e0d0; text-align: center;">
                <h2 style="color: #915200; margin-top: 0; font-size: 22px;">Reset Your Password</h2>
                <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">You requested a password reset. Use the code below to proceed:</p>
                
                <div style="margin: 25px 0;">
                    <div style="background-color: #ffffff; color: #915200; font-size: 32px; font-weight: bold; padding: 15px; border: 2px dashed #915200; border-radius: 8px; font-family: monospace; letter-spacing: 5px; display: inline-block; word-break: break-all;">
                        ${otp}
                    </div>
                </div>
                
                <p style="color: #718096; font-size: 13px; margin-bottom: 0;">⏳ Valid for 10 minutes.</p>
            </div>
        </div>

        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #a0aec0; font-size: 12px; border-top: 1px solid #edf2f7;">
            <p style="margin: 0;">If you did not request this, you can safely ignore this email.</p>
            <p style="margin: 5px 0 0;">&copy; ${new Date().getFullYear()} AURUM. All rights reserved.</p>
        </div>
    </div>
    `;

    try {
        await sendEmail({
            email: user.email,
            subject: '🔑 Password Reset OTP - AURUM',
            message,
            html: emailTemplate
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

const verifyMerchantLoginOtp = async (req, res) => {
    const { email, otp } = req.body;
    const merchant = await Merchant.findOne({ email });

    if (merchant && merchant.loginOtp === otp && merchant.loginOtpExpire > Date.now()) {
        merchant.loginOtp = undefined;
        merchant.loginOtpExpire = undefined;
        await merchant.save();

        res.json({
            _id: merchant._id,
            name: merchant.name,
            email: merchant.email,
            role: merchant.role,
            plan: merchant.plan,
            token: generateToken(merchant._id),
        });
    } else {
        res.status(400).json({ message: 'Invalid OTP or expired' });
    }
};

const sendLoginOtp = async (req, res) => {
    const { email } = req.body;
    const merchant = await Merchant.findOne({ email });

    if (!merchant) {
        return res.status(404).json({ message: 'Email not registered' });
    }

    if (merchant.status !== 'Approved') {
        return res.status(401).json({ message: `Account status: ${merchant.status || 'Pending'}.` });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    merchant.loginOtp = otp;
    merchant.loginOtpExpire = Date.now() + 10 * 60 * 1000;
    await merchant.save();

    const emailTemplate = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; width: 100%; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff; overflow: hidden;">
        <div style="text-align: center; padding: 30px 20px; background-color: #ffffff;">
            <div style="font-size: 48px; margin-bottom: 10px;">💎</div>
            <h1 style="color: #915200; font-size: 26px; margin: 0; font-weight: 800; letter-spacing: -0.5px;">AURUM</h1>
            <p style="color: #888; font-size: 13px; margin: 5px 0 0; text-transform: uppercase; letter-spacing: 1px;">Premium Jewelry Management</p>
        </div>
        
        <div style="padding: 0 20px 30px 20px;">
            <div style="background-color: #fff8f0; padding: 30px 20px; border-radius: 12px; border: 1px solid #f0e0d0; text-align: center;">
                <h2 style="color: #915200; margin-top: 0; font-size: 22px;">Login Verification</h2>
                <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">Use the One-Time Password (OTP) below to securely verify your login:</p>
                
                <div style="margin: 25px 0;">
                    <div style="background-color: #ffffff; color: #915200; font-size: 32px; font-weight: bold; padding: 15px; border: 2px dashed #915200; border-radius: 8px; font-family: monospace; letter-spacing: 5px; display: inline-block; word-break: break-all;">
                        ${otp}
                    </div>
                </div>
                
                <p style="color: #718096; font-size: 13px; margin-bottom: 0;">⏳ Valid for 10 minutes.</p>
            </div>
        </div>

        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #a0aec0; font-size: 12px; border-top: 1px solid #edf2f7;">
            <p style="margin: 0;">If you did not request this code, please ignore it.</p>
            <p style="margin: 5px 0 0;">&copy; ${new Date().getFullYear()} AURUM. All rights reserved.</p>
        </div>
    </div>
    `;

    try {
        await sendEmail({
            email: merchant.email,
            subject: '💎 Login Verification Code - AURUM',
            message: `Your login verification code is ${otp}`,
            html: emailTemplate
        });
        res.json({ message: 'OTP sent to email', email, otpSent: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Email could not be sent' });
    }
};

const sendRegistrationOtp = async (req, res) => {
    const { email } = req.body;

    const exists = await Merchant.findOne({ email });
    if (exists) {
        return res.status(400).json({ message: 'Email already registered' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Delete existing OTPs
    await Verification.deleteMany({ email });
    await Verification.create({ email, otp });

    const emailTemplate = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; width: 100%; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff; overflow: hidden;">
        <div style="text-align: center; padding: 30px 20px; background-color: #ffffff;">
            <div style="font-size: 48px; margin-bottom: 10px;">💎</div>
            <h1 style="color: #915200; font-size: 26px; margin: 0; font-weight: 800; letter-spacing: -0.5px;">AURUM</h1>
            <p style="color: #888; font-size: 13px; margin: 5px 0 0; text-transform: uppercase; letter-spacing: 1px;">Premium Jewelry Management</p>
        </div>
        
        <div style="padding: 0 20px 30px 20px;">
            <div style="background-color: #fff8f0; padding: 30px 20px; border-radius: 12px; border: 1px solid #f0e0d0; text-align: center;">
                <h2 style="color: #915200; margin-top: 0; font-size: 22px;">Verify Your Email</h2>
                <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">Welcome to Aurum! Verify your email address to continue registration:</p>
                
                <div style="margin: 25px 0;">
                    <div style="background-color: #ffffff; color: #915200; font-size: 32px; font-weight: bold; padding: 15px; border: 2px dashed #915200; border-radius: 8px; font-family: monospace; letter-spacing: 5px; display: inline-block; word-break: break-all;">
                        ${otp}
                    </div>
                </div>
                
                <p style="color: #718096; font-size: 13px; margin-bottom: 0;">⏳ Valid for 10 minutes.</p>
            </div>
        </div>

        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #a0aec0; font-size: 12px; border-top: 1px solid #edf2f7;">
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} AURUM. All rights reserved.</p>
        </div>
    </div>
    `;

    try {
        await sendEmail({
            email,
            subject: '✉️ Email Verification - AURUM',
            message: `Your verification code is ${otp}`,
            html: emailTemplate
        });
        res.json({ message: 'Verification OTP sent' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Email could not be sent' });
    }
};

const verifyRegistrationOtp = async (req, res) => {
    const { email, otp } = req.body;
    const record = await Verification.findOne({ email, otp });

    if (record) {
        await Verification.deleteOne({ _id: record._id });
        res.json({ success: true, message: 'Email verified' });
    } else {
        res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
};

export {
    authUser, registerUser, authMerchant, registerMerchant, checkEmailExists,
    forgotPassword, resetPassword, verifyOtp, verifyMerchantLoginOtp,
    sendLoginOtp, sendRegistrationOtp, verifyRegistrationOtp
};
