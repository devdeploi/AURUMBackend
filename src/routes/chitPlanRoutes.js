import express from 'express';
import { createChitPlan, getMerchantChitPlans, getChitPlans, subscribeToChitPlan, updateChitPlan, deleteChitPlan, getMySubscribedPlans, getUserSubscribedPlans, requestWithdrawal, settleWithdrawal, markAsDelivered } from '../controllers/chitPlanController.js';
import { protect, merchantOnly } from '../middleware/authMiddleware.js';

import { getMerchantSubscribers } from '../controllers/subscriberController.js';

const router = express.Router();

router.route('/')
    .get(getChitPlans)
    .post(protect, merchantOnly, createChitPlan);

router.get('/my-subscribers', protect, merchantOnly, getMerchantSubscribers);
router.get('/merchant/:id', getMerchantChitPlans);
router.get('/user/:userId', protect, getUserSubscribedPlans); // Admin/User protect
router.get('/my-plans', protect, getMySubscribedPlans);

router.route('/:id')
    .put(protect, merchantOnly, updateChitPlan)
    .delete(protect, merchantOnly, deleteChitPlan);

router.post('/:id/subscribe', protect, subscribeToChitPlan);
router.post('/:id/withdraw', protect, requestWithdrawal);
router.post('/:id/settle', protect, merchantOnly, settleWithdrawal);
router.post('/:id/deliver', protect, merchantOnly, markAsDelivered);

export default router;
