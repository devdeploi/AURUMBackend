import ChitPlan from '../models/ChitPlan.js';

// @desc    Create a new chit plan (Merchant only)
// @route   POST /api/chit-plans
// @access  Private/Merchant
const createChitPlan = async (req, res) => {
    // Check if merchant's bank account verification is done
    if (req.user.bankDetails?.verificationStatus !== 'verified') {
        res.status(403).json({ message: 'Bank details verification required to create chit plans.' });
        return;
    }

    const { planName, monthlyAmount, durationMonths, description, totalAmount: providedTotal } = req.body;

    const totalAmount = providedTotal || (monthlyAmount * durationMonths);

    const chitPlan = new ChitPlan({
        merchant: req.user._id,
        planName,
        monthlyAmount,
        durationMonths,
        totalAmount,
        description
    });

    const createdChitPlan = await chitPlan.save();
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
    const chitPlan = await ChitPlan.findById(req.params.id);

    if (chitPlan) {
        // Check if already subscribed
        const alreadySubscribed = chitPlan.subscribers.find(
            (r) => r.user.toString() === req.user._id.toString()
        );

        if (alreadySubscribed) {
            res.status(400).json({ message: 'Already subscribed' });
            return;
        }

        const subscription = {
            user: req.user._id,
        };

        chitPlan.subscribers.push(subscription);
        await chitPlan.save();

        res.status(201).json({ message: 'Subscribed successfully' });
    } else {
        res.status(404).json({ message: 'Chit plan not found' });
    }
};

// @desc    Update a chit plan (Merchant only)
// @route   PUT /api/chit-plans/:id
// @access  Private/Merchant
const updateChitPlan = async (req, res) => {
    const { planName, monthlyAmount, durationMonths, description } = req.body;
    const chitPlan = await ChitPlan.findById(req.params.id);

    if (chitPlan) {
        if (chitPlan.merchant.toString() !== req.user._id.toString()) {
            res.status(401).json({ message: 'Not authorized to update this plan' });
            return;
        }

        chitPlan.planName = planName || chitPlan.planName;
        chitPlan.monthlyAmount = monthlyAmount || chitPlan.monthlyAmount;
        chitPlan.durationMonths = durationMonths || chitPlan.durationMonths;
        chitPlan.description = description || chitPlan.description;

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

export { createChitPlan, getMerchantChitPlans, getChitPlans, subscribeToChitPlan, updateChitPlan, deleteChitPlan };
