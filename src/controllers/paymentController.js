import paypal from 'paypal-rest-sdk';
import crypto from 'crypto';
import Payment from '../models/Payment.js';
import ChitPlan from '../models/ChitPlan.js';
import Merchant from '../models/Merchant.js';
import User from '../models/User.js';
import Razorpay from 'razorpay';
import razorpay from '../config/razorpay.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import sendEmail from '../utils/sendEmail.js';
import {
    paymentRequestTemplate,
    paymentRequestMerchantTemplate,
    paymentApprovedTemplate,
    paymentApprovedMerchantTemplate,
    paymentRejectedTemplate
} from '../utils/emailTemplates.js';

// @desc    Initiate PayPal Payment
// @route   POST /api/payments/pay
// @access  Private
const createPayment = async (req, res) => {
    const { chitPlanId, amount } = req.body;

    const chitPlan = await ChitPlan.findById(chitPlanId).populate('merchant');
    if (!chitPlan) {
        res.status(404).json({ message: 'Chit plan not found' });
        return;
    }

    const merchant = chitPlan.merchant;

    // KYC Verification Check (RBI Compliance)
    if (merchant.kycStatus !== 'verified') {
        res.status(403).json({
            message: 'Merchant is not verified to receive payments. Verification Status: ' + merchant.kycStatus
        });
        return;
    }

    if (!merchant.paypalEmail) {
        res.status(400).json({ message: 'Merchant does not have a PayPal account linked' });
        return;
    }

    // Convert amount to string and potentially currency (PayPal handles INR but sometimes restricts)
    // For safety in this demo, defaulting to USD if INR issues occur, but trying INR first
    const currency = 'USD'; // Using USD for sandbox reliability
    // In real app, exchange rate logic needed if amount is in INR

    const create_payment_json = {
        "intent": "sale",
        "payer": {
            "payment_method": "paypal"
        },
        "redirect_urls": {
            "return_url": `http://localhost:${process.env.PORT || 5000}/api/payments/success?userId=${req.user._id}&chitPlanId=${chitPlanId}&amount=${amount}`,
            "cancel_url": `http://localhost:${process.env.PORT || 5000}/api/payments/cancel`
        },
        "transactions": [{
            "item_list": {
                "items": [{
                    "name": `Chit Plan: ${chitPlan.planName}`,
                    "sku": chitPlanId,
                    "price": amount,
                    "currency": currency,
                    "quantity": 1
                }]
            },
            "amount": {
                "currency": currency,
                "total": amount
            },
            "description": `Payment for Chit Plan ${chitPlan.planName}`,
            "payee": {
                "email": merchant.paypalEmail
            }
        }]
    };

    paypal.payment.create(create_payment_json, function (error, payment) {
        if (error) {
            console.error(JSON.stringify(error));
            res.status(500).json({ message: 'PayPal Payment Creation Failed', error: error.response });
        } else {
            for (let i = 0; i < payment.links.length; i++) {
                if (payment.links[i].rel === 'approval_url') {
                    res.json({ approvalUrl: payment.links[i].href });
                    return;
                }
            }
            res.status(500).json({ message: 'Approval URL not found' });
        }
    });
};

// @desc    Execute PayPal Payment
// @route   GET /api/payments/success
// @access  Public (Callback)
const executePayment = async (req, res) => {
    const { paymentId, PayerID, userId, chitPlanId, amount } = req.query;

    const execute_payment_json = {
        "payer_id": PayerID,
        "transactions": [{
            "amount": {
                "currency": "USD",
                "total": amount
            }
        }]
    };

    paypal.payment.execute(paymentId, execute_payment_json, async function (error, payment) {
        if (error) {
            console.error(error.response);
            res.status(500).json({ message: 'Payment Execution Failed' });
        } else {
            // Save payment to DB
            const transaction = new Payment({
                user: userId,
                merchant: payment.transactions[0].payee ? await getMerchantIdByEmail(payment.transactions[0].payee.email) : null, // Logic to get ID needs refinement if payee email isn't reliable source for ID lookup, but we have chitPlanId
                chitPlan: chitPlanId,
                amount: amount,
                paymentId: paymentId,
                status: 'Completed',
                paymentDetails: payment
            });

            // Better way to find merchant:
            const chitPlan = await ChitPlan.findById(chitPlanId);
            if (chitPlan) {
                transaction.merchant = chitPlan.merchant;
            }

            await transaction.save();

            res.json({ message: 'Payment Successful', payment });
            // In a real app, redirect to a frontend success page: 
            // res.redirect('http://localhost:3000/payment/success');
        }
    });
};

const cancelPayment = (req, res) => {
    res.json({ message: 'Payment Cancelled' });
};

// @desc    Create Razorpay Order for Subscription (Standard or Route Split)
// @route   POST /api/payments/create-subscription-order
// @access  Public
const createSubscriptionOrder = async (req, res) => {
    const { amount, currency = 'INR', chitPlanId } = req.body;

    // Default to Platform Keys
    let razorpayInstance = razorpay;
    let keyId = process.env.RAZORPAY_KEY_ID;
    let isDirectMerchantPayment = false;
    let commissionInPaisa = 0;

    try {
        // Remove any non-numeric characters from amount
        const numericAmount = parseFloat(amount.toString().replace(/[^0-9.]/g, ''));
        const amountInPaisa = Math.round(numericAmount * 100);
        let chitPlan = null;

        // 1. Fetch ChitPlan & Merchant Details FIRST to decide on keys
        if (chitPlanId) {
            chitPlan = await ChitPlan.findById(chitPlanId).populate('merchant');

            // Calculate 2% commission/fee for ALL plan payments
            commissionInPaisa = Math.round(amountInPaisa * 0.02);
        }

        // 2. Determine Payment Mode (Direct vs Platform)
        if (chitPlan && chitPlan.merchant) {
            // Check for Direct Merchant Keys
            if (chitPlan.merchant.razorpayKeyId && chitPlan.merchant.razorpayKeySecret) {
                try {
                    const decryptedKeyId = decrypt(chitPlan.merchant.razorpayKeyId);
                    const decryptedKeySecret = decrypt(chitPlan.merchant.razorpayKeySecret);

                    razorpayInstance = new Razorpay({
                        key_id: decryptedKeyId,
                        key_secret: decryptedKeySecret
                    });
                    keyId = decryptedKeyId;
                    isDirectMerchantPayment = true;

                    // Commission is retained (added to total) to cover Gateway Fees in Merchant Account

                } catch (decryptionError) {
                    console.error("Error decrypting merchant keys, falling back to Platform Route", decryptionError);
                }
            }
        }

        const totalAmountInPaisa = amountInPaisa + commissionInPaisa;

        const options = {
            amount: totalAmountInPaisa,
            currency,
            receipt: `receipt_${Date.now()}`,
            notes: {
                base_amount: numericAmount,
                commission_amount: (commissionInPaisa / 100).toFixed(2),
                chitPlanId: chitPlanId || ''
            }
        };

        // 4. Apply Razorpay Route Transfers if using Platform Keys
        if (!isDirectMerchantPayment && chitPlan && chitPlan.merchant && chitPlan.merchant.razorpayAccountId) {
            options.transfers = [
                {
                    account: chitPlan.merchant.razorpayAccountId,
                    amount: amountInPaisa, // Merchant gets base amount
                    currency: "INR",
                    notes: {
                        branch: "Main",
                        name: "Merchant Payout"
                    },
                    linked_account_notes: [
                        "branch"
                    ],
                    on_hold: 0,
                    on_hold_until: null
                }
            ];
            // Platform keeps the difference (totalAmountInPaisa - amountInPaisa = commissionInPaisa)
        }

        const order = await razorpayInstance.orders.create(options);
        res.json({ ...order, keyId }); // Return keyId to frontend

    } catch (error) {
        console.error("Razorpay Order Error:", error);
        console.error("Error Details:", error.error);
        res.status(500).send("Error creating order");
    }
};

// ... verifySubscriptionPayment stays the same ...

// @desc    Verify Razorpay Payment
// @route   POST /api/payments/verify-subscription-payment
// @access  Public
const verifySubscriptionPayment = async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

    if (expectedSignature === razorpay_signature) {
        res.json({ status: 'success', message: 'Payment verified' });
    } else {
        res.status(400).json({ status: 'failure', message: 'Invalid signature' });
    }
};

// @desc    Create Razorpay Order for Installment
// @route   POST /api/payments/create-installment-order
// @access  Private
const createInstallmentOrder = createSubscriptionOrder; // Re-use logic as it handles routing funds correctly

// @desc    Verify Razorpay Payment for Installment
// @route   POST /api/payments/verify-installment
// @access  Private
const verifyInstallmentPayment = async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId, paymentId, signature, chitPlanId } = req.body;

    // Handle variable naming mismatch (Frontend sends camelCase, Controller expected snake_case)
    const r_order_id = razorpay_order_id || orderId;
    const r_payment_id = razorpay_payment_id || paymentId;
    const r_signature = razorpay_signature || signature;

    const chitPlan = await ChitPlan.findById(chitPlanId).populate('merchant');

    if (!chitPlan) {
        res.status(404).json({ message: 'Chit plan not found' });
        return;
    }

    try {
        let secret = process.env.RAZORPAY_KEY_SECRET;
        let isDirectMerchantPayment = false; // Track payment type

        // Check if Merchant Keys should be used
        if (chitPlan && chitPlan.merchant && chitPlan.merchant.razorpayKeyId && chitPlan.merchant.razorpayKeySecret) {
            try {
                secret = decrypt(chitPlan.merchant.razorpayKeySecret);
                isDirectMerchantPayment = true; // Mark as Direct
            } catch (e) {
                console.error("Error decrypting merchant secret for verification", e);
            }
        }

        const body = r_order_id + "|" + r_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature !== r_signature) {
            console.log("Signature Mismatch:", { expected: expectedSignature, received: r_signature, body });
            res.status(400).json({ status: 'failure', message: 'Invalid signature' });
            return;
        }

        // Find subscriber

        // ... (check subscriber) ...
        const subscriber = chitPlan.subscribers.find(
            s => s.user.toString() === req.user._id.toString()
        );

        if (!subscriber) {
            res.status(404).json({ message: 'Subscription not found for this user' });
            return;
        }

        // Calculate commission (2% for all online payments)
        const baseAmount = chitPlan.monthlyAmount;
        // Always 2% (Platform Fee or Gateway Fee buffer)
        const commissionAmount = Number((baseAmount * 0.02).toFixed(2));

        // Create Payment Record
        const payment = new Payment({
            user: req.user._id,
            merchant: chitPlan.merchant, // Use just the ID if it's populated
            chitPlan: chitPlan._id,
            amount: baseAmount,
            commissionAmount: commissionAmount,
            paymentId: r_payment_id,
            status: 'Completed',
            paymentDetails: {
                razorpay_order_id: r_order_id,
                razorpay_payment_id: r_payment_id,
                razorpay_signature: r_signature,
                type: 'installment',
                commissionPaid: commissionAmount
            }
        });

        await payment.save();

        // Update Subscriber Stats
        // We assume valid payment means +1 installment.
        // In a real robust system, we might check if this orderId was already processed to avoid duplicates.
        // Update Subscriber Stats
        subscriber.installmentsPaid = (subscriber.installmentsPaid || 0) + 1;
        subscriber.totalPaid = (subscriber.totalPaid || 0) + chitPlan.monthlyAmount;
        subscriber.lastPaymentDate = new Date();

        // Mark as completed if done?
        if (subscriber.installmentsPaid >= chitPlan.durationMonths) {
            subscriber.status = 'completed';
        }

        // Since subscribers is an array of subdocuments
        await chitPlan.save();

        // Send Email Notifications (Success)
        try {
            // 1. To User
            const userTemplate = paymentApprovedTemplate(req.user.name, chitPlan.monthlyAmount, chitPlan.planName);
            await sendEmail({
                email: req.user.email,
                subject: userTemplate.subject,
                html: userTemplate.html
            });

            // 2. To Merchant
            const merchantTemplate = paymentApprovedMerchantTemplate(chitPlan.merchant.name, req.user.name, chitPlan.monthlyAmount, chitPlan.planName);
            await sendEmail({
                email: chitPlan.merchant.email,
                subject: merchantTemplate.subject,
                html: merchantTemplate.html
            });
        } catch (error) {
            console.error("Email send failed (Installment)", error);
        }

        res.json({ status: 'success', message: 'Installment verified and updated' });

    } catch (error) {
        console.error("Verify Installment Error:", error);
        res.status(500).json({ message: 'Verification failed', error: error.message });
    }
};

// @desc    Request Offline Payment (User)
// @route   POST /api/payments/offline/request
// @access  Private
const requestOfflinePayment = async (req, res) => {
    const { chitPlanId, amount, notes, proofImage, date } = req.body;

    const chitPlan = await ChitPlan.findById(chitPlanId).populate('merchant');
    if (!chitPlan) {
        res.status(404).json({ message: 'Chit plan not found' });
        return;
    }

    const payment = new Payment({
        user: req.user._id,
        merchant: chitPlan.merchant._id,
        chitPlan: chitPlanId,
        amount: Number(amount),
        status: 'Pending Approval',
        type: 'offline',
        paymentDate: date || Date.now(),
        proofImage,
        notes,
        paymentDetails: {
            method: 'offline_request',
            requestedAt: new Date()
        }
    });

    await payment.save();

    // Send Email Notifications
    try {
        // 1. To User (Request Received)
        const userTemplate = paymentRequestTemplate(req.user.name, amount, chitPlan.planName, date || Date.now());
        await sendEmail({
            email: req.user.email,
            subject: userTemplate.subject,
            html: userTemplate.html
        });

        // 2. To Merchant (New Request)
        const merchantTemplate = paymentRequestMerchantTemplate(chitPlan.merchant.name, req.user.name, amount, chitPlan.planName);
        await sendEmail({
            email: chitPlan.merchant.email,
            subject: merchantTemplate.subject,
            html: merchantTemplate.html
        });
    } catch (error) {
        console.error("Email send failed (Payment Request)", error);
    }

    res.status(201).json(payment);
};

// @desc    Get Pending Offline Payments (Merchant)
// @route   GET /api/payments/offline/pending
// @access  Private/Merchant
const getPendingOfflinePayments = async (req, res) => {
    const payments = await Payment.find({
        merchant: req.user._id,
        status: 'Pending Approval',
        type: 'offline'
    })
        .populate('user', 'name email phone profileImage address')
        .populate('chitPlan', 'planName monthlyAmount')
        .sort({ createdAt: -1 });

    res.json(payments);
};

// @desc    Approve Offline Payment (Merchant)
// @route   PUT /api/payments/offline/:id/approve
// @access  Private/Merchant
const approveOfflinePayment = async (req, res) => {
    const payment = await Payment.findById(req.params.id).populate('user');

    if (!payment) {
        res.status(404).json({ message: 'Payment not found' });
        return;
    }

    if (payment.merchant.toString() !== req.user._id.toString()) {
        res.status(403).json({ message: 'Not authorized' });
        return;
    }

    if (payment.status === 'Completed') {
        res.status(400).json({ message: 'Payment already completed' });
        return;
    }

    const chitPlan = await ChitPlan.findById(payment.chitPlan);
    if (!chitPlan) {
        res.status(404).json({ message: 'Associated chit plan not found' });
        return;
    }

    // Update Payment
    payment.status = 'Completed';
    await payment.save();

    // Update Subscriber Stats
    const subscriber = chitPlan.subscribers.find(s => s.user.toString() === payment.user._id.toString());
    if (subscriber) {
        subscriber.installmentsPaid = (subscriber.installmentsPaid || 0) + 1;
        subscriber.totalPaid = (subscriber.totalPaid || 0) + payment.amount;
        subscriber.lastPaymentDate = new Date(); // Or payment.paymentDate? keeping to approval time or payment date? let's use actual payment date if logical, but system time is safer for "processed". using payment.paymentDate might be better for record keeping.

        if (subscriber.installmentsPaid >= chitPlan.durationMonths) {
            subscriber.status = 'completed';
        }
        await chitPlan.save();
    }

    // Send Email Notifications
    try {
        // 1. To User (Approved)
        const userTemplate = paymentApprovedTemplate(payment.user.name, payment.amount, chitPlan.planName);
        await sendEmail({
            email: payment.user.email,
            subject: userTemplate.subject,
            html: userTemplate.html
        });

        // 2. To Merchant (Confirmation) - req.user is merchant
        const merchantTemplate = paymentApprovedMerchantTemplate(req.user.name, payment.user.name, payment.amount, chitPlan.planName);
        await sendEmail({
            email: req.user.email,
            subject: merchantTemplate.subject,
            html: merchantTemplate.html
        });
    } catch (error) {
        console.error("Email send failed (Approve)", error);
    }

    res.json({ message: 'Payment approved', payment });
};

// @desc    Reject Offline Payment (Merchant)
// @route   PUT /api/payments/offline/:id/reject
// @access  Private/Merchant
const rejectOfflinePayment = async (req, res) => {
    const payment = await Payment.findById(req.params.id).populate('user').populate('chitPlan');

    if (!payment) {
        res.status(404).json({ message: 'Payment not found' });
        return;
    }

    if (payment.merchant.toString() !== req.user._id.toString()) {
        res.status(403).json({ message: 'Not authorized' });
        return;
    }

    payment.status = 'Rejected';
    await payment.save();

    // Send Email Notification
    try {
        // To User (Rejected)
        // Note: payment.chitPlan IS populated now, or likely is ID. 
        // Populate above ensures it's an object if found, but if plan deleted maybe null.
        // Safer to check or used cached ID if populate fails.
        const planName = payment.chitPlan?.planName || 'Chit Plan';

        const userTemplate = paymentRejectedTemplate(payment.user.name, payment.amount, planName);
        await sendEmail({
            email: payment.user.email,
            subject: userTemplate.subject,
            html: userTemplate.html
        });
    } catch (error) {
        console.error("Email send failed (Reject)", error);
    }

    res.json({ message: 'Payment rejected', payment });
};

// @desc    Record Manual Offline Payment (Merchant)
// @route   POST /api/payments/offline/record
// @access  Private/Merchant
const recordManualPayment = async (req, res) => {
    const { chitPlanId, userId, amount, notes, date } = req.body;

    const chitPlan = await ChitPlan.findById(chitPlanId);
    if (!chitPlan) {
        res.status(404).json({ message: 'Chit plan not found' });
        return;
    }

    const user = await User.findById(userId);
    if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
    }

    // Create Completed Payment directly
    const payment = new Payment({
        user: userId,
        merchant: req.user._id,
        chitPlan: chitPlanId,
        amount: Number(amount),
        status: 'Completed',
        type: 'offline',
        paymentDate: date || Date.now(),
        notes: notes || 'Recorded manually by merchant',
        paymentDetails: {
            method: 'manual_entry',
            recordedBy: req.user._id
        }
    });

    await payment.save();

    // Update Stats
    const subscriber = chitPlan.subscribers.find(s => s.user.toString() === userId.toString());
    if (subscriber) {
        subscriber.installmentsPaid = (subscriber.installmentsPaid || 0) + 1;
        subscriber.totalPaid = (subscriber.totalPaid || 0) + Number(amount);
        subscriber.lastPaymentDate = date || new Date();

        if (subscriber.installmentsPaid >= chitPlan.durationMonths) {
            subscriber.status = 'completed';
        }
        await chitPlan.save();
    }

    // Send Emails
    try {
        // 1. To User
        const userTemplate = paymentApprovedTemplate(user.name, amount, chitPlan.planName);
        await sendEmail({
            email: user.email,
            subject: userTemplate.subject,
            html: userTemplate.html
        });

        // 2. To Merchant (Confirmation)
        const merchantTemplate = paymentApprovedMerchantTemplate(req.user.name, user.name, amount, chitPlan.planName);
        await sendEmail({
            email: req.user.email,
            subject: merchantTemplate.subject,
            html: merchantTemplate.html
        });

    } catch (error) {
        console.error("Email send failed (Manual)", error);
    }

    res.status(201).json(payment);
};

// @desc    Get complete payment history for a subscriber in a plan
// @route   GET /api/payments/history/:chitPlanId/:userId
// @access  Private/Merchant
const getSubscriberPaymentHistory = async (req, res) => {
    try {
        const chitPlan = await ChitPlan.findById(req.params.chitPlanId);
        if (!chitPlan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        if (chitPlan.merchant.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const payments = await Payment.find({
            chitPlan: req.params.chitPlanId,
            user: req.params.userId
        }).sort({ createdAt: -1 });

        res.json(payments);
    } catch (error) {
        console.error("Error fetching history:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get payments for a specific date (Premium Feature)
// @route   GET /api/payments/search/date
// @access  Private/Merchant
const getPaymentsByDate = async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ message: 'Date parameter is required' });
    }

    // Check Premium Status
    // Assuming req.user is populated with merchant details including 'plan'
    // If not, we might need to query Merchant model, but typically auth middleware populates user.
    // Based on previous contexts, merchant object often has 'plan' field ('Basic' or 'Premium').
    if (req.user.plan !== 'Premium') {
        return res.status(403).json({ message: 'This feature is available only for Premium merchants' });
    }

    try {
        const searchDate = new Date(date);
        const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));

        const payments = await Payment.find({
            merchant: req.user._id,
            status: { $regex: 'Completed', $options: 'i' }, // Flexible match for 'Completed'
            paymentDate: {
                $gte: startOfDay,
                $lte: endOfDay
            }
        })
            .populate('user', 'name phone email profileImage')
            .populate('chitPlan', 'planName totalAmount')
            .sort({ paymentDate: -1 });

        res.json(payments);

    } catch (error) {
        console.error("Error searching payments by date:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

export {
    createPayment,
    executePayment,
    cancelPayment,
    createSubscriptionOrder,
    verifySubscriptionPayment,
    createInstallmentOrder,
    verifyInstallmentPayment,
    requestOfflinePayment,
    getPendingOfflinePayments,
    approveOfflinePayment,

    rejectOfflinePayment,
    recordManualPayment,
    getSubscriberPaymentHistory,
    getPaymentsByDate
};
