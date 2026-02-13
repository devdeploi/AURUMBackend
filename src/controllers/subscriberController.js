import ChitPlan from '../models/ChitPlan.js';

// @desc    Get all subscribers for a specific merchant's chit plans
// @route   GET /api/chit-plans/subscribers
// @access  Private/Merchant
const getMerchantSubscribers = async (req, res) => {
    try {
        const merchantId = req.user._id;

        // Find all plans owned by this merchant
        const plans = await ChitPlan.find({ merchant: merchantId })
            .populate('subscribers.user', 'name email phone profileImage address'); // Populate user details from User model

        let allSubscribers = [];

        plans.forEach(plan => {
            if (plan.subscribers && plan.subscribers.length > 0) {
                plan.subscribers.forEach(sub => {
                    if (sub.user) { // Check if user still exists
                        // Calculate metrics
                        const installmentsPaid = sub.installmentsPaid || 1;
                        const totalAmountPaid = sub.totalPaid || (installmentsPaid * plan.monthlyAmount);
                        const pendingInstallments = plan.durationMonths - installmentsPaid;
                        const pendingAmount = pendingInstallments * plan.monthlyAmount;

                        // Next Due Date logic
                        const joinedDate = new Date(sub.joinedAt);
                        const nextDueDate = new Date(joinedDate);
                        nextDueDate.setMonth(nextDueDate.getMonth() + installmentsPaid);

                        allSubscribers.push({
                            subscriberId: sub._id, // The subscription record ID
                            user: {
                                _id: sub.user._id,
                                name: sub.user.name,
                                email: sub.user.email,
                                phone: sub.user.phone,
                                profileImage: sub.user.profileImage || null,
                                address: sub.user.address || null
                            },
                            plan: {
                                _id: plan._id,
                                planName: plan.planName,
                                monthlyAmount: plan.monthlyAmount,
                                totalAmount: plan.totalAmount,
                                durationMonths: plan.durationMonths,
                                returnType: plan.returnType
                            },
                            subscription: {
                                joinedAt: sub.joinedAt,
                                installmentsPaid: installmentsPaid,
                                totalAmountPaid: totalAmountPaid,
                                pendingAmount: pendingAmount >= 0 ? pendingAmount : 0,
                                nextDueDate: nextDueDate,
                                totalSaved: installmentsPaid * plan.monthlyAmount,
                                status: sub.status, // active, completed, etc.
                                withdrawalRequest: sub.withdrawalRequest,
                                settlementDetails: sub.settlementDetails,
                                deliveryDetails: sub.deliveryDetails
                            },
                            withdrawal: {
                                request: sub.withdrawalRequest
                            }
                        });
                    }
                });
            }
        });

        // Optional Sorting: Most recent joiners first
        allSubscribers.sort((a, b) => new Date(b.subscription.joinedAt) - new Date(a.subscription.joinedAt));

        res.json(allSubscribers);

    } catch (error) {
        console.error("Error fetching subscribers:", error);
        res.status(500).json({ message: 'Failed to fetch subscribers' });
    }
};

export { getMerchantSubscribers };
