import User from '../models/User.js';
import Merchant from '../models/Merchant.js';
import Verification from '../models/Verification.js';
import generateToken from '../utils/generateToken.js';
import { encrypt } from '../utils/encryption.js';
import sendEmail from '../utils/sendEmail.js';
import sendSms from '../utils/sendSms.js';
import razorpay from '../config/razorpay.js';

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
const authUser = async (req, res) => {
    const { email, password } = req.body;

    // Check if input is email or phone
    const isEmail = email.includes('@');
    const query = isEmail ? { email } : { phone: email };

    const user = await User.findOne(query);

    if (user && (await user.matchPassword(password))) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            address: user.address,
            profileImage: user.profileImage,
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
    const merchantExists = await Merchant.findOne({ email });

    if (userExists || merchantExists) {
        res.status(400).json({ message: 'Email already registered' });
        return;
    }

    const userPhoneExists = await User.findOne({ phone });
    const merchantPhoneExists = await Merchant.findOne({ phone });

    if (userPhoneExists || merchantPhoneExists) {
        res.status(400).json({ message: 'Phone number already registered' });
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
            phone: user.phone,
            address: user.address,
            profileImage: user.profileImage,
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

    const isEmail = email.includes('@');
    const query = isEmail ? { email } : { phone: email };

    const merchant = await Merchant.findOne(query);

    if (merchant && (await merchant.matchPassword(password))) {
        if (merchant.status === 'Rejected') {
            res.status(401).json({ message: `Your account is ${merchant.status || 'Rejected'}. Please contact Admin for Refund.` });
            return;
        }
        if (merchant.status !== 'Approved') {
            res.status(401).json({ message: `Your account is ${merchant.status || 'Pending'}. Please wait for Admin approval.` });
            return;
        }

        // Check Subscription Expiry
        if (merchant.subscriptionExpiryDate) {
            const now = new Date();
            const expiry = new Date(merchant.subscriptionExpiryDate);
            const gracePeriodEnd = new Date(expiry);
            gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 1); // 1 day grace period

            if (now > expiry) {
                // Auto change status if not already expired
                if (merchant.subscriptionStatus !== 'expired') {
                    merchant.subscriptionStatus = 'expired';
                    await merchant.save();
                }

                // If grace period passed, we STILL allow login so they can renew on dashboard
                // The frontend will handle the blocking UI
            }
        }

        const isExpired = merchant.subscriptionStatus === 'expired' || (merchant.subscriptionExpiryDate && new Date() > new Date(merchant.subscriptionExpiryDate));

        // Direct Login - No OTP needed for password login
        res.json({
            _id: merchant._id,
            name: merchant.name,
            email: merchant.email,
            role: merchant.role,
            plan: merchant.plan,
            token: generateToken(merchant._id),
            subscriptionStatus: merchant.subscriptionStatus,
            subscriptionExpiryDate: merchant.subscriptionExpiryDate,
            isGracePeriod: isExpired && new Date() <= new Date(new Date(merchant.subscriptionExpiryDate).getTime() + 24 * 60 * 60 * 1000),
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
        name, email, password, phone, address, plan, billingCycle, paymentId,
        bankDetails, shopImages, gstin, addressProof
    } = req.body;

    const merchantExists = await Merchant.findOne({ email });
    const userExists = await User.findOne({ email });

    if (merchantExists || userExists) {
        res.status(400).json({ message: 'Email already registered' });
        return;
    }

    const merchantPhoneExists = await Merchant.findOne({ phone });
    const userPhoneExists = await User.findOne({ phone });

    if (merchantPhoneExists || userPhoneExists) {
        res.status(400).json({ message: 'Phone number already registered' });
        return;
    }

    const merchant = await Merchant.create({
        name,
        email,
        password,
        phone,
        address,
        plan,
        billingCycle: billingCycle || 'monthly',
        paymentId,
        shopImages, // Save shop images
        // Save bankDetails directly
        bankDetails: bankDetails || {},
        gstin,
        addressProof
    });

    // Create Razorpay Linked Account automatically (Optional - Fail Safe)
    try {
        const account = await razorpay.accounts.create({
            type: "route",
            name: name,
            email: email,
            contact_name: name,
            phone: phone,
            profile: {
                category: "services",
                subcategory: "telecommunication_service"
            }
        });

        merchant.razorpayAccountId = account.id;

        // Link Bank Account if provided
        if (bankDetails && bankDetails.accountNumber && bankDetails.ifscCode) {
            try {
                await razorpay.accounts.createBankAccount(account.id, {
                    ifsc_code: bankDetails.ifscCode,
                    account_number: bankDetails.accountNumber,
                    beneficiary_name: bankDetails.accountHolderName || name,
                });
                console.log(`Bank account linked for merchant ${account.id}`);
            } catch (bankLinkError) {
                console.error("Could not link bank account automatically:", bankLinkError);
            }
        }

        await merchant.save();

    } catch (accError) {
        // Log the error but DO NOT fail the registration. 
        // Example: Route not enabled, or network issue.
        // The merchant can retry linking from Dashboard later.
        console.error("Failed to create Razorpay Linked Account during registration (Non-fatal):", accError);
    }

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

// @desc    Check if email or phone exists
// @route   POST /api/check-email
// @access  Public
const checkEmailExists = async (req, res) => {
    const { email, phone } = req.body;

    if (email) {
        const userExists = await User.findOne({ email });
        const merchantExists = await Merchant.findOne({ email });

        if (merchantExists) {
            return res.json({ exists: true, isMerchant: true, message: 'Merchant account exists with this email' });
        }
        if (userExists) {
            return res.json({ exists: true, isUser: true, message: 'User account exists with this email' });
        }
    }

    if (phone) {
        const userPhoneExists = await User.findOne({ phone });
        const merchantPhoneExists = await Merchant.findOne({ phone });

        if (merchantPhoneExists) {
            return res.json({ exists: true, isMerchant: true, message: 'Merchant account exists with this phone' });
        }
        if (userPhoneExists) {
            return res.json({ exists: true, isUser: true, message: 'User account exists with this phone' });
        }
    }

    return res.json({ exists: false });
};

const verifyMerchantLoginOtp = async (req, res) => {
    const { email, otp } = req.body; // email field can contain phone

    const isEmail = email.includes('@');
    const query = isEmail ? { email } : { phone: email };

    const merchant = await Merchant.findOne(query);

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
    const { email } = req.body; // email field can contain phone

    const isEmail = email.includes('@');
    const query = isEmail ? { email } : { phone: email };

    const merchant = await Merchant.findOne(query);

    if (!merchant) {
        return res.status(404).json({ message: 'Account not registered' });
    }

    if (merchant.status !== 'Approved') {
        return res.status(401).json({ message: `Account status: ${merchant.status || 'Pending'}.` });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    merchant.loginOtp = otp;
    merchant.loginOtpExpire = Date.now() + 10 * 60 * 1000;
    await merchant.save();

    if (isEmail) {
        // Send Email
        const emailTemplate = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff; color: #333333;">
            <div style="background-color: #915200; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 1px;">AURUM</h1>
                <p style="color: #ffffff; margin: 5px 0 0; font-size: 12px; opacity: 0.9;">Premium Jewelry Management</p>
            </div>
            
            <div style="padding: 30px 20px; text-align: center;">
                <h2 style="color: #915200; margin-top: 0; font-size: 20px;">Login Verification</h2>
                <p style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">Use the One-Time Password (OTP) below to securely verify your login.</p>
                
                <div style="text-align: center; margin: 25px 0;">
                    <div style="font-size: 32px; font-weight: bold; color: #915200; border: 2px dashed #915200; padding: 15px 30px; display: inline-block; letter-spacing: 5px; border-radius: 4px;">
                        ${otp}
                    </div>
                </div>
                <p style="font-size: 12px; color: #666666; margin-bottom: 0;">This code is valid for 10 minutes.</p>
            </div>

            <div style="background-color: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #666666; border-top: 1px solid #eeeeee; border-radius: 0 0 8px 8px;">
                <p style="margin: 0 0 5px;">&copy; ${new Date().getFullYear()} AURUM. All rights reserved.</p>
                <p style="margin: 0;">Powered by <a href="https://www.safprotech.com" target="_blank" style="color: #915200; text-decoration: none; font-weight: 500;">Safpro Technology Solutions</a></p>
            </div>
        </div>
        `;

        try {
            await sendEmail({
                email: merchant.email,
                subject: 'Login Verification Code - AURUM',
                message: `Your login verification code is ${otp}`,
                html: emailTemplate
            });
            return res.json({ message: 'OTP sent to email', sentTo: 'email', otpSent: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Email could not be sent' });
        }
    } else {
        // Send SMS
        try {
            await sendSms({
                phone: merchant.phone,
                message: `Your AURUM Login OTP is ${otp}. Valid for 10 minutes.`
            });
            return res.json({ message: 'OTP sent to mobile', sentTo: 'mobile', otpSent: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'SMS could not be sent' });
        }
    }
};

const sendRegistrationOtp = async (req, res) => {
    const { email, phone } = req.body;

    const userExists = await User.findOne({ email });
    const merchantExists = await Merchant.findOne({ email });
    const merchantPhoneExists = await Merchant.findOne({ phone });
    const userPhoneExists = await User.findOne({ phone });

    if (merchantExists) {
        return res.status(400).json({ message: 'Merchant email already registered' });
    }
    if (merchantPhoneExists) {
        return res.status(400).json({ message: 'Merchant phone already registered' });
    }

    if (userExists) {
        return res.status(400).json({ message: 'Email already registered as User' });
    }
    if (userPhoneExists) {
        return res.status(400).json({ message: 'Phone already registered as User' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Delete existing OTPs
    await Verification.deleteMany({ email });
    await Verification.create({
        email,
        phone,
        otp
    });

    // Send Email
    const emailTemplate = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff; color: #333333;">
        <div style="background-color: #915200; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 1px;">AURUM</h1>
            <p style="color: #ffffff; margin: 5px 0 0; font-size: 12px; opacity: 0.9;">Premium Jewelry Management</p>
        </div>
        
        <div style="padding: 30px 20px; text-align: center;">
            <h2 style="color: #915200; margin-top: 0; font-size: 20px;">Verification Code</h2>
            <p style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">Please use the code below to verify your identity.</p>
            
            <div style="text-align: center; margin: 25px 0;">
                <div style="font-size: 32px; font-weight: bold; color: #915200; border: 2px dashed #915200; padding: 15px 30px; display: inline-block; letter-spacing: 5px; border-radius: 4px;">
                    ${otp}
                </div>
            </div>
             <p style="font-size: 12px; color: #666666; margin-bottom: 0;">This code is valid for 10 minutes.</p>
        </div>

        <div style="background-color: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #666666; border-top: 1px solid #eeeeee; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 5px;">&copy; ${new Date().getFullYear()} AURUM. All rights reserved.</p>
            <p style="margin: 0;">Powered by <a href="https://www.safprotech.com" target="_blank" style="color: #915200; text-decoration: none; font-weight: 500;">Safpro Technology Solutions</a></p>
        </div>
    </div>
    `;

    try {
        await sendEmail({
            email,
            subject: 'Verification Code - AURUM',
            message: `Your verification code is ${otp}`,
            html: emailTemplate
        });

        // Send SMS
        if (phone) {
            await sendSms({
                phone,
                message: `Your AURUM Registration OTP is ${otp}.`
            });
        }

        res.json({ message: 'Verification OTP sent to Email and Phone' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to send OTPs' });
    }
};

const verifyRegistrationOtp = async (req, res) => {
    const { email, otp } = req.body;

    // Find latest verification record
    const record = await Verification.findOne({ email }).sort({ createdAt: -1 });

    if (record) {
        if (record.otp === otp) {
            await Verification.deleteMany({ email }); // Clear all
            res.json({ success: true, message: 'Verified Successfully' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid OTP.' });
        }
    } else {
        res.status(400).json({ success: false, message: 'OTP Expired or Invalid' });
    }
};

export {
    authUser, registerUser, authMerchant, registerMerchant, checkEmailExists,
    forgotPassword, resetPassword, verifyOtp, verifyMerchantLoginOtp,
    sendLoginOtp, sendRegistrationOtp, verifyRegistrationOtp
};
