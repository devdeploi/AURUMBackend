import express from 'express';
import { createChitPlan, getMerchantChitPlans, getChitPlans, subscribeToChitPlan, updateChitPlan, deleteChitPlan, getMySubscribedPlans, getUserSubscribedPlans } from '../controllers/chitPlanController.js';
import { protect, merchantOnly } from '../middleware/authMiddleware.js';

import { getMerchantSubscribers } from '../controllers/subscriberController.js';

const router = express.Router();

router.route('/')
    .get(getChitPlans)
    .post(protect, merchantOnly, createChitPlan);

router.get('/my-subscribers', protect, merchantOnly, getMerchantSubscribers);
router.get('/merchant/:id', getMerchantChitPlans);
router.get('/user/:userId', protect, getUserSubscribedPlans);
router.get('/my-plans', protect, getMySubscribedPlans);
// router.get('/merchant/:id', getMerchantChitPlans); // Already there
router.route('/:id')
    .put(protect, merchantOnly, updateChitPlan)
    .delete(protect, merchantOnly, deleteChitPlan);

router.post('/:id/subscribe', protect, subscribeToChitPlan);

export default router;
