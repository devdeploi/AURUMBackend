import Merchant from '../models/Merchant.js';
import ChitPlan from '../models/ChitPlan.js';
import { encrypt } from '../utils/encryption.js';
import sendEmail from '../utils/sendEmail.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';

// @desc    Get all merchants
// @route   GET /api/merchants
// @access  Public
const getMerchants = async (req, res) => {
    const pageSize = Number(req.query.limit) || 10;
    const page = Number(req.query.page) || 1;

    // Filter by status (optional)
    const statusFilter = req.query.status
        ? { status: req.query.status }
        : {};

    // Filter by subscription status
    const subscriptionFilter = req.query.subscriptionStatus
        ? { subscriptionStatus: req.query.subscriptionStatus }
        : {};

    // Search by name (optional)
    const keywordFilter = req.query.keyword
        ? {
            name: {
                $regex: req.query.keyword,
                $options: 'i',
            },
        }
        : {};

    const filter = { ...statusFilter, ...subscriptionFilter, ...keywordFilter };

    const total = await Merchant.countDocuments(filter);

    // Sorting (default: newest first)
    const sort = req.query.sort
        ? { [req.query.sort]: -1 }
        : { createdAt: -1 };

    const merchants = await Merchant.find(filter)
        .select('-password')
        .sort(sort)
        .limit(pageSize)
        .skip(pageSize * (page - 1));

    const totalPages = Math.ceil(total / pageSize);

    res.json({
        merchants,
        pagination: {
            page,
            pageSize,
            totalRecords: total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        },
    });
};


// @desc    Update merchant status
// @route   PUT /api/merchants/:id/status
// @access  Private/Admin
const updateMerchantStatus = async (req, res) => {
    const { status } = req.body; // 'Approved', 'Rejected', 'Pending'
    const merchant = await Merchant.findById(req.params.id);

    if (merchant) {
        const oldStatus = merchant.status;
        merchant.status = status;

        if (status === 'Approved' && oldStatus !== 'Approved') {
            const now = new Date();
            const endDate = new Date(now);
            endDate.setDate(endDate.getDate() + 30);

            merchant.subscriptionStartDate = now;
            merchant.subscriptionExpiryDate = endDate;
            merchant.subscriptionStatus = 'active';
        }

        const updatedMerchant = await merchant.save();

        // Send Email Notification
        if (oldStatus !== status) {
            const loginUrl = `${process.env.FRONTEND_URL}/aurum/login`;

            const emailTemplate = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; width: 100%; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff; overflow: hidden;">
                <div style="text-align: center; padding: 30px 20px; background-color: #ffffff;">
                    <div style="font-size: 48px; margin-bottom: 10px;">💎</div>
                    <h1 style="color: #915200; font-size: 26px; margin: 0; font-weight: 800; letter-spacing: -0.5px;">AURUM</h1>
                    <p style="color: #888; font-size: 13px; margin: 5px 0 0; text-transform: uppercase; letter-spacing: 1px;">Premium Jewelry Management</p>
                </div>
                
                <div style="padding: 0 20px 30px 20px;">
                    <div style="background-color: ${status === 'Approved' ? '#f0fff4' : '#fff5f5'}; padding: 30px 20px; border-radius: 12px; border: 1px solid ${status === 'Approved' ? '#c3e6cb' : '#f5c6cb'}; text-align: center;">
                        <h2 style="color: ${status === 'Approved' ? '#28a745' : '#dc3545'}; margin-top: 0; font-size: 22px;">
                            ${status === 'Approved' ? 'Account Approved! ✅' : 'Status Update ⚠️'}
                        </h2>
                        
                        <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Dear <strong>${merchant.name}</strong>,</p>
                        
                        ${status === 'Approved' ? `
                        <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 25px;">Your merchant account has been <strong>APPROVED</strong>. You now have full access to managing your chit schemes.</p>
                        
                        <div style="margin: 30px 0;">
                            <!-- Button with display: inline-block to prevent cut off -->
                            <a href="${loginUrl}" target="_blank" style="display: inline-block; background-color: #915200; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(145, 82, 0, 0.2); transition: background-color 0.3s;">
                                Login
                            </a>
                        </div>
                        
                        <p style="color: #718096; font-size: 13px; margin-top: 20px; word-break: break-all;">
                            Or paste this link:<br/>
                            <a href="${loginUrl}" style="color: #915200; text-decoration: underline;">${loginUrl}</a>
                        </p>
                        ` : `
                        <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">Your account status has been updated to: <strong>${status}</strong>.</p>
                        <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">For further details or assistance, please reach out to our support team.</p>
                        `}
                    </div>
                </div>

                <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #a0aec0; font-size: 12px; border-top: 1px solid #edf2f7;">
                    <p style="margin: 0;">&copy; ${new Date().getFullYear()} AURUM. All rights reserved.</p>
                    <p style="margin: 5px 0 0;">Secure. Compliant. Efficient.</p>
                </div>
            </div>
            `;

            try {
                await sendEmail({
                    email: merchant.email,
                    subject: `📢 Account ${status} - AURUM`,
                    message: `Your account status has been updated to ${status}.`,
                    html: emailTemplate
                });
            } catch (error) {
                console.error('Status update email failed:', error);
            }
        }

        res.json(updatedMerchant);
    } else {
        res.status(404).json({ message: 'Merchant not found' });
    }
};

// @desc    Get merchant by ID
// @route   GET /api/merchants/:id
// @access  Public
const getMerchantById = async (req, res) => {
    const merchant = await Merchant.findById(req.params.id).select('-password');
    if (merchant) {
        res.json(merchant);
    } else {
        res.status(404).json({ message: 'Merchant not found' });
    }
};

// @desc    Delete merchant
// @route   DELETE /api/merchants/:id
// @access  Private/Admin
const deleteMerchant = async (req, res) => {
    const merchant = await Merchant.findById(req.params.id);

    if (merchant) {
        await merchant.deleteOne();
        res.json({ message: 'Merchant removed' });
    } else {
        res.status(404).json({ message: 'Merchant not found' });
    }
};

// @desc    Update merchant profile
// @route   PUT /api/merchants/:id
// @access  Private
const updateMerchantProfile = async (req, res) => {
    const merchant = await Merchant.findById(req.params.id);

    if (merchant) {
        merchant.name = req.body.name || merchant.name;
        merchant.phone = req.body.phone || merchant.phone;
        merchant.address = req.body.address || merchant.address;
        merchant.plan = req.body.plan || merchant.plan;
        merchant.paymentId = req.body.paymentId || merchant.paymentId;

        // Update Bank Details
        if (req.body.bankDetails) {
            merchant.bankDetails = {
                ...merchant.bankDetails, // Keep existing fields
                accountHolderName: req.body.bankDetails.accountHolderName || merchant.bankDetails?.accountHolderName,
                accountNumber: req.body.bankDetails.accountNumber || merchant.bankDetails?.accountNumber,
                ifscCode: req.body.bankDetails.ifscCode || merchant.bankDetails?.ifscCode,
                bankName: req.body.bankDetails.bankName || merchant.bankDetails?.bankName,
                branchName: req.body.bankDetails.branchName || merchant.bankDetails?.branchName,
                verifiedName: req.body.bankDetails.verifiedName || merchant.bankDetails?.verifiedName,
                verificationStatus: req.body.bankDetails.verificationStatus || merchant.bankDetails?.verificationStatus || 'pending'
            };
        }

        // Update PAN Details
        if (req.body.gstin) {
            merchant.gstin = req.body.gstin;
        }

        if (req.body.addressProof) {
            merchant.addressProof = req.body.addressProof;
        }

        if (req.body.shopImages) {
            merchant.shopImages = req.body.shopImages;
        }

        const updatedMerchant = await merchant.save();
        res.json(updatedMerchant);
    } else {
        res.status(404).json({ message: 'Merchant not found' });
    }
};

// @desc    Renew merchant plan
// @route   POST /api/merchants/renew-plan
// @access  Private/Merchant
const renewMerchantPlan = async (req, res) => {
    const { plan } = req.body; // 'Standard' or 'Premium'

    // Ensure req.user exists (middleware should handle this)
    if (!req.user || !req.user._id) {
        return res.status(401).json({ message: 'Not authorized' });
    }

    const merchantId = req.user._id;
    const merchant = await Merchant.findById(merchantId);

    if (!merchant) {
        return res.status(404).json({ message: 'Merchant not found' });
    }

    const chitPlanCount = await ChitPlan.countDocuments({ merchant: merchantId });

    // "if 6 chits is previous is fully used then he is forced to get premium"
    // "if his chit has under 3 then he can selected any plan"
    // Interpretation: >= 6 requires Premium. < 6 allows Standard/Premium.
    if (chitPlanCount >= 6 && plan !== 'Premium') {
        return res.status(400).json({ message: 'You have utilized 6 or more chits. You must upgrade to Premium Plan.' });
    }

    // Update Plan and Subscription
    merchant.plan = plan;

    const now = new Date();
    const currentExpiry = merchant.subscriptionExpiryDate ? new Date(merchant.subscriptionExpiryDate) : new Date(0);
    let newExpiryDate;

    if (currentExpiry > now) {
        newExpiryDate = new Date(currentExpiry);
        newExpiryDate.setDate(newExpiryDate.getDate() + 30);
    } else {
        newExpiryDate = new Date(now);
        newExpiryDate.setDate(newExpiryDate.getDate() + 30);
    }

    merchant.subscriptionStartDate = now;
    merchant.subscriptionExpiryDate = newExpiryDate;
    merchant.subscriptionStatus = 'active';

    const updatedMerchant = await merchant.save();

    res.json(updatedMerchant);
};

// @desc    Create Razorpay Order for Renewal
// @route   POST /api/merchants/create-renewal-order
// @access  Private/Merchant
const createRenewalOrder = async (req, res) => {
    const { plan } = req.body;
    const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Define Prices
    const prices = {
        'Standard': 1500, // INR
        'Premium': 5000
    };

    if (!prices[plan]) {
        return res.status(400).json({ message: 'Invalid plan selected' });
    }

    const options = {
        amount: prices[plan] * 100, // amount in paisa
        currency: "INR",
        receipt: `rnw_${Date.now()}`, // Shortened receipt ID
    };

    try {
        const order = await instance.orders.create(options);
        res.json({ order, keyId: process.env.RAZORPAY_KEY_ID });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Order creation failed' });
    }
};

// @desc    Verify Razorpay Payment and Renew
// @route   POST /api/merchants/verify-renewal
// @access  Private/Merchant
const verifyRenewalPayment = async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");

    if (expectedSignature === razorpay_signature) {
        // Payment Success
        const merchant = await Merchant.findById(req.user._id);

        // 1. Update Payment Info
        // In a real app, save to a Payment Log collection

        // 2. Renew Subscription
        merchant.plan = plan;

        const now = new Date();
        const currentExpiry = merchant.subscriptionExpiryDate ? new Date(merchant.subscriptionExpiryDate) : new Date(0);
        let newExpiryDate;

        // If currently valid (expiry in future), extend from THAT date
        if (currentExpiry > now) {
            newExpiryDate = new Date(currentExpiry);
            newExpiryDate.setDate(newExpiryDate.getDate() + 30);
        } else {
            // Expired, so start fresh from now
            newExpiryDate = new Date(now);
            newExpiryDate.setDate(newExpiryDate.getDate() + 30);
        }

        merchant.subscriptionStartDate = now; // Track last payment/renewal date 
        merchant.subscriptionExpiryDate = newExpiryDate;
        merchant.subscriptionStatus = 'active';

        const updated = await merchant.save();

        res.json({ success: true, merchant: updated });
    } else {
        res.status(400).json({ success: false, message: "Invalid Signature" });
    }
};

export {
    getMerchants,
    getMerchantById,
    updateMerchantStatus,
    deleteMerchant,
    updateMerchantProfile,
    renewMerchantPlan,
    createRenewalOrder,
    verifyRenewalPayment
};
