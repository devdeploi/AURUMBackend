import User from '../models/User.js';
import Merchant from '../models/Merchant.js';
import Verification from '../models/Verification.js';
import generateToken from '../utils/generateToken.js';
import { encrypt } from '../utils/encryption.js';
import sendEmail from '../utils/sendEmail.js';
import sendSms from '../utils/sendSms.js';
import razorpay from '../config/razorpay.js';
import {
    merchantRegistrationReceivedTemplate,
    passwordResetOtpTemplate,
    loginOtpTemplate,
    verificationCodeTemplate
} from '../utils/emailTemplates.js';

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
        // iOS Login Restriction (Premium Only)
        if (req.body.platform === 'ios' && merchant.plan !== 'Premium') {
            res.status(403).json({ message: 'Access to the iOS app is available only for Premium plan users.' });
            return;
        }

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
            phone: merchant.phone,
            role: merchant.role,
            plan: merchant.plan,
            shopLogo: merchant.shopLogo,
            gstin: merchant.gstin,
            address: merchant.address,
            addressProof: merchant.addressProof,
            bankDetails: merchant.bankDetails,
            shopImages: merchant.shopImages,
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
        shopImages,
        bankDetails: bankDetails || {},
        gstin,
        addressProof
    });

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
        console.error("Failed to create Razorpay Linked Account during registration:", accError);
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

        const { subject, html: emailHtml } = merchantRegistrationReceivedTemplate(merchant.name, merchant.plan, merchant.email);

        try {
            await sendEmail({
                email: merchant.email,
                subject: `🎉 ${subject} - AURUM`,
                message: `Welcome to AURUM. Your registration for ${merchant.plan} plan is received.`,
                html: emailHtml
            });
        } catch (error) {
            console.error('Registration email failed:', error);
        }
    } else {
        res.status(400).json({ message: 'Invalid merchant data' });
    }
};

const forgotPassword = async (req, res) => {
    const { email: identifier } = req.body;

    const isEmail = identifier.includes('@');
    const query = isEmail ? { email: identifier } : { phone: identifier };

    let user = await User.findOne(query);

    if (!user) {
        user = await Merchant.findOne(query);
    }

    if (!user) {
        return res.status(404).json({ message: 'Account not registered' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetPasswordOtp = otp;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    const message = `Your password reset OTP is ${otp}. Valid for 10 minutes.`;

    if (user.email) {
        const { subject: resetSubject, html: resetEmailHtml } = passwordResetOtpTemplate(otp);

        try {
            await sendEmail({
                email: user.email,
                subject: `🔑 ${resetSubject} - AURUM`,
                message,
                html: resetEmailHtml
            });
        } catch (error) {
            console.error('Failed to send reset email:', error);
        }
    }

    if (user.phone) {
        try {
            await sendSms({
                phone: user.phone,
                message: `Your AURUM Password Reset OTP is ${otp}. Valid for 10 minutes.`
            });
        } catch (error) {
            console.error('Failed to send reset SMS:', error);
        }
    }

    res.status(200).json({ message: 'OTP sent to your registered email/phone' });
};

const resetPassword = async (req, res) => {
    const { email: identifier, otp, newPassword } = req.body;

    const isEmail = identifier.includes('@');
    const query = isEmail ? { email: identifier } : { phone: identifier };

    let user = await User.findOne(query);

    if (!user) {
        user = await Merchant.findOne(query);
    }

    if (!user) {
        return res.status(404).json({ message: 'Account not registered' });
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
    const { email: identifier, otp } = req.body;

    const isEmail = identifier.includes('@');
    const query = isEmail ? { email: identifier } : { phone: identifier };

    let user = await User.findOne(query);

    if (!user) {
        user = await Merchant.findOne(query);
    }

    if (!user) {
        return res.status(404).json({ message: 'Account not registered' });
    }

    if (user.resetPasswordOtp === otp && user.resetPasswordExpire > Date.now()) {
        res.status(200).json({ message: 'OTP verified' });
    } else {
        res.status(400).json({ message: 'Invalid OTP or expired' });
    }
};

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
    const { email, otp } = req.body;

    const isEmail = email.includes('@');
    const query = isEmail ? { email } : { phone: email };

    let account = await Merchant.findOne(query);
    let isMerchant = true;

    if (!account) {
        account = await User.findOne(query);
        isMerchant = false;
    }

    if (account && account.loginOtp === otp && account.loginOtpExpire > Date.now()) {
        account.loginOtp = undefined;
        account.loginOtpExpire = undefined;
        await account.save({ validateBeforeSave: false });

        const response = {
            _id: account._id,
            name: account.name,
            email: account.email,
            role: account.role,
            token: generateToken(account._id),
            phone: account.phone,
        };

        if (isMerchant) {
            response.plan = account.plan;
            response.shopLogo = account.shopLogo;
            response.gstin = account.gstin;
            response.address = account.address;
            response.addressProof = account.addressProof;
            response.bankDetails = account.bankDetails;
            response.shopImages = account.shopImages;
            response.subscriptionStatus = account.subscriptionStatus;
            response.subscriptionExpiryDate = account.subscriptionExpiryDate;

            const isExpired = account.subscriptionStatus === 'expired' ||
                (account.subscriptionExpiryDate && new Date() > new Date(account.subscriptionExpiryDate));
            response.isGracePeriod = isExpired &&
                new Date() <= new Date(new Date(account.subscriptionExpiryDate).getTime() + 24 * 60 * 60 * 1000);
        } else {
            response.address = account.address;
            response.profileImage = account.profileImage;
        }

        res.json(response);
    } else {
        res.status(400).json({ message: 'Invalid OTP or expired' });
    }
};

const sendLoginOtp = async (req, res) => {
    const { email } = req.body;

    const isEmail = email.includes('@');
    const query = isEmail ? { email } : { phone: email };

    let account = await Merchant.findOne(query);
    let isMerchant = true;

    if (!account) {
        account = await User.findOne(query);
        isMerchant = false;
    }

    if (!account) {
        return res.status(404).json({ message: 'Account not registered' });
    }

    if (isMerchant && account.status !== 'Approved') {
        return res.status(401).json({ message: `Account status: ${account.status || 'Pending'}.` });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    account.loginOtp = otp;
    account.loginOtpExpire = Date.now() + 10 * 60 * 1000;
    await account.save({ validateBeforeSave: false });

    if (isEmail) {
        const { subject: loginSubject, html: loginEmailHtml } = loginOtpTemplate(otp);

        try {
            await sendEmail({
                email: account.email,
                subject: `🔑 ${loginSubject} - AURUM`,
                message: `Your login verification code is ${otp}`,
                html: loginEmailHtml
            });
            return res.json({ message: 'OTP sent to email', sentTo: 'email', otpSent: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Email could not be sent' });
        }
    } else {
        try {
            await sendSms({
                phone: account.phone,
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

    await Verification.deleteMany({ email });
    await Verification.create({
        email,
        phone,
        otp
    });

    const { subject: regSubject, html: regEmailHtml } = verificationCodeTemplate(otp);

    try {
        await sendEmail({
            email,
            subject: `${regSubject} - AURUM`,
            message: `Your verification code is ${otp}`,
            html: regEmailHtml
        });

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

    const record = await Verification.findOne({ email }).sort({ createdAt: -1 });

    if (record) {
        if (record.otp === otp) {
            await Verification.deleteMany({ email });
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
