import ChitPlan from '../models/ChitPlan.js';
import Payment from '../models/Payment.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import sendEmail from '../utils/sendEmail.js';
import {
    planCreatedMerchantTemplate,
    subscriptionSuccessTemplate,
    subscriptionAlertMerchantTemplate
} from '../utils/emailTemplates.js';

// @desc    Create a new chit plan (Merchant only)
// @route   POST /api/chit-plans
// @access  Private/Merchant
const createChitPlan = async (req, res) => {
    // Check if merchant's bank account verification is done
    // Check if merchant's bank account verification is done
    // if (req.user.bankDetails?.verificationStatus !== 'verified') {
    //     res.status(403).json({ message: 'Bank details verification required to create chit plans.' });
    //     return;
    // }

    const { planName, monthlyAmount, durationMonths, description, returnType, totalAmount: providedTotal } = req.body;

    const totalAmount = providedTotal || (monthlyAmount * durationMonths);

    const chitPlan = new ChitPlan({
        merchant: req.user._id,
        planName,
        monthlyAmount,
        durationMonths,
        totalAmount,
        description,
        returnType // Add returnType
    });

    const createdChitPlan = await chitPlan.save();

    // Send Plan Created Email
    try {
        const { subject, html } = planCreatedMerchantTemplate(req.user.name, planName);
        await sendEmail({
            email: req.user.email,
            subject,
            html
        });
    } catch (error) {
        console.error("Email send failed (Plan Created)", error);
    }

    res.status(201).json(createdChitPlan);
};

// @desc    Get all chit plans for a merchant
// @route   GET /api/chit-plans/merchant/:id
// @access  Public
const getMerchantChitPlans = async (req, res) => {
    const pageSize = Number(req.query.limit) || 10;
    const page = Number(req.query.page) || 1;

    const count = await ChitPlan.countDocuments({ merchant: req.params.id });
    const chitPlans = await ChitPlan.find({ merchant: req.params.id })
        .populate('subscribers.user', 'name email')
        .limit(pageSize)
        .skip(pageSize * (page - 1));

    res.json({ plans: chitPlans, page, pages: Math.ceil(count / pageSize), total: count });
};

// @desc    Get all chit plans (for users to browse)
// @route   GET /api/chit-plans
// @access  Public
const getChitPlans = async (req, res) => {
    const pageSize = Number(req.query.limit) || 10;
    const page = Number(req.query.page) || 1;

    // Optional filtering
    const keyword = req.query.keyword ? {
        planName: {
            $regex: req.query.keyword,
            $options: 'i',
        },
    } : {};

    const count = await ChitPlan.countDocuments({ ...keyword });
    const chitPlans = await ChitPlan.find({ ...keyword })
        .populate('merchant', 'name')
        .limit(pageSize)
        .skip(pageSize * (page - 1));

    res.json({ plans: chitPlans, page, pages: Math.ceil(count / pageSize), total: count });
};

// @desc    Subscribe to a chit plan
// @route   POST /api/chit-plans/:id/subscribe
// @access  Private
const subscribeToChitPlan = async (req, res) => {
    const { paymentId, orderId, signature } = req.body;
    const chitPlan = await ChitPlan.findById(req.params.id).populate('merchant');

    if (chitPlan) {
        // 1. Verify Payment Signature
        const body = orderId + "|" + paymentId;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature !== signature) {
            res.status(400).json({ message: 'Invalid payment signature' });
            return;
        }

        // 2. Check if already subscribed
        const alreadySubscribed = chitPlan.subscribers.find(
            (r) => r.user.toString() === req.user._id.toString()
        );

        if (alreadySubscribed) {
            res.status(400).json({ message: 'Already subscribed' });
            return;
        }

        // 3. Create Payment Record
        const baseAmount = chitPlan.monthlyAmount;
        const commissionAmount = Number((baseAmount * 0.02).toFixed(2));

        const payment = new Payment({
            user: req.user._id,
            merchant: chitPlan.merchant._id,
            chitPlan: chitPlan._id,
            amount: baseAmount, // First installment base amount
            commissionAmount: commissionAmount,
            paymentId: paymentId,
            orderId: orderId,
            status: 'Completed',
            paymentDetails: {
                razorpay_payment_id: paymentId,
                razorpay_order_id: orderId,
                razorpay_signature: signature,
                commissionPaid: commissionAmount
            }
        });
        await payment.save();

        // 4. Add User to Subscribers
        const subscription = {
            user: req.user._id,
            joinedAt: Date.now(),
            installmentsPaid: 1, // First one paid
            totalPaid: chitPlan.monthlyAmount
        };

        chitPlan.subscribers.push(subscription);
        await chitPlan.save();

        // Send Email Notifications
        try {
            // 1. To User
            const userTemplate = subscriptionSuccessTemplate(req.user.name, chitPlan.planName, chitPlan.merchant.name);
            await sendEmail({
                email: req.user.email,
                subject: userTemplate.subject,
                html: userTemplate.html
            });

            // 2. To Merchant
            const merchantTemplate = subscriptionAlertMerchantTemplate(chitPlan.merchant.name, req.user.name, chitPlan.planName);
            await sendEmail({
                email: chitPlan.merchant.email,
                subject: merchantTemplate.subject,
                html: merchantTemplate.html
            });

        } catch (error) {
            console.error("Email send failed (Subscription)", error);
        }

        // Payout to merchant is now likely handled via Route transfers in createSubscriptionOrder or separately.
        // We do NOT call payoutToMerchant here anymore to avoid double transfers or errors if using Route.

        res.status(201).json({ message: 'Subscribed successfully', subscription });
    } else {
        res.status(404).json({ message: 'Chit plan not found' });
    }
};

// @desc    Get logged in user's subscribed plans
// @route   GET /api/chit-plans/my-plans
// @access  Private
const getMySubscribedPlans = async (req, res) => {
    try {
        const plans = await ChitPlan.find({
            'subscribers.user': req.user._id
        }).populate('merchant', 'name email phone address shopLogo');

        // Transform for analytics
        const myPlans = await Promise.all(plans.map(async plan => {
            const sub = plan.subscribers.find(s => s.user.toString() === req.user._id.toString());
            const installmentsPaid = sub.installmentsPaid || 1; // Default to 1 if not tracked yet
            const joinedDate = new Date(sub.joinedAt);

            // Calculate next due date (approx 1 month from join date + months paid)
            const nextDueDate = new Date(joinedDate);
            nextDueDate.setMonth(nextDueDate.getMonth() + installmentsPaid);

            // Remaining
            const remainingMonths = Math.max(0, plan.durationMonths - installmentsPaid);
            const totalSaved = installmentsPaid * plan.monthlyAmount;

            // Fetch History
            const history = await Payment.find({
                chitPlan: plan._id,
                user: req.user._id
            }).sort({ createdAt: -1 });

            return {
                _id: plan._id,
                planName: plan.planName,
                merchant: plan.merchant,
                totalAmount: plan.totalAmount,
                monthlyAmount: plan.monthlyAmount,
                durationMonths: plan.durationMonths,
                joinedAt: sub.joinedAt,
                nextDueDate,
                installmentsPaid,
                remainingMonths,
                totalSaved,
                status: sub.status,
                history // Added history
            };
        }));

        res.json(myPlans);

    } catch (error) {
        res.status(500).json({ message: 'Error fetching plans' });
    }
};

// @desc    Update a chit plan (Merchant only)
// @route   PUT /api/chit-plans/:id
// @access  Private/Merchant
const updateChitPlan = async (req, res) => {
    const { planName, monthlyAmount, durationMonths, description, returnType } = req.body;
    const chitPlan = await ChitPlan.findById(req.params.id);

    if (chitPlan) {
        if (chitPlan.merchant.toString() !== req.user._id.toString()) {
            res.status(401).json({ message: 'Not authorized to update this plan' });
            return;
        }

        chitPlan.planName = planName || chitPlan.planName;
        chitPlan.monthlyAmount = monthlyAmount || chitPlan.monthlyAmount;
        chitPlan.durationMonths = durationMonths || chitPlan.durationMonths;
        chitPlan.durationMonths = durationMonths || chitPlan.durationMonths;
        chitPlan.description = description || chitPlan.description;
        chitPlan.returnType = returnType || chitPlan.returnType; // Update returnType

        if (req.body.totalAmount) {
            chitPlan.totalAmount = req.body.totalAmount;
        } else if (monthlyAmount || durationMonths) {
            chitPlan.totalAmount = chitPlan.monthlyAmount * chitPlan.durationMonths;
        }

        const updatedChitPlan = await chitPlan.save();
        res.json(updatedChitPlan);
    } else {
        res.status(404).json({ message: 'Chit plan not found' });
    }
};

// @desc    Delete a chit plan (Merchant only)
// @route   DELETE /api/chit-plans/:id
// @access  Private/Merchant
const deleteChitPlan = async (req, res) => {
    const chitPlan = await ChitPlan.findById(req.params.id);

    if (chitPlan) {
        if (chitPlan.merchant.toString() !== req.user._id.toString()) {
            res.status(401).json({ message: 'Not authorized to delete this plan' });
            return;
        }

        await chitPlan.deleteOne();
        res.json({ message: 'Chit plan removed' });
    } else {
        res.status(404).json({ message: 'Chit plan not found' });
    }
};

// @desc    Get specific user's subscribed plans (Admin)
// @route   GET /api/chit-plans/user/:userId
// @access  Private/Admin
const getUserSubscribedPlans = async (req, res) => {
    try {
        const userId = req.params.userId;
        const plans = await ChitPlan.find({
            'subscribers.user': userId
        }).populate('merchant', 'name email phone address');

        const userPlans = await Promise.all(plans.map(async plan => {
            const sub = plan.subscribers.find(s => s.user.toString() === userId.toString());
            const installmentsPaid = sub.installmentsPaid || 1;
            const joinedDate = new Date(sub.joinedAt);

            const nextDueDate = new Date(joinedDate);
            nextDueDate.setMonth(nextDueDate.getMonth() + installmentsPaid);

            const remainingMonths = Math.max(0, plan.durationMonths - installmentsPaid);
            const totalSaved = installmentsPaid * plan.monthlyAmount;

            // Fetch History
            const history = await Payment.find({
                chitPlan: plan._id,
                user: userId
            }).sort({ createdAt: -1 });

            return {
                _id: plan._id,
                planName: plan.planName,
                merchant: plan.merchant,
                totalAmount: plan.totalAmount,
                monthlyAmount: plan.monthlyAmount,
                durationMonths: plan.durationMonths,
                joinedAt: sub.joinedAt,
                nextDueDate,
                installmentsPaid,
                remainingMonths,
                totalSaved,
                status: sub.status,
                history
            };
        }));

        res.json(userPlans);

    } catch (error) {
        res.status(500).json({ message: 'Error fetching user plans' });
    }
};

export { createChitPlan, getMerchantChitPlans, getChitPlans, subscribeToChitPlan, updateChitPlan, deleteChitPlan, getMySubscribedPlans, getUserSubscribedPlans };
