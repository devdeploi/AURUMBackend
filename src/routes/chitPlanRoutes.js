import express from 'express';
import { createChitPlan, getMerchantChitPlans, getChitPlans, subscribeToChitPlan, updateChitPlan, deleteChitPlan, getMySubscribedPlans, getUserSubscribedPlans } from '../controllers/chitPlanController.js';
import { protect, merchantOnly } from '../middleware/authMiddleware.js';

import { getMerchantSubscribers } from '../controllers/subscriberController.js';

const router = express.Router();

router.route('/')
    .get(getChitPlans)
    .post(createChitPlan);

router.get('/my-subscribers',  getMerchantSubscribers);
router.get('/merchant/:id', getMerchantChitPlans);
router.get('/user/:userId', getUserSubscribedPlans);
router.get('/my-plans',  getMySubscribedPlans);
// router.get('/merchant/:id', getMerchantChitPlans); // Already there
router.route('/:id')
    .put(updateChitPlan)
    .delete(deleteChitPlan);

router.post('/:id/subscribe', subscribeToChitPlan);

export default router;
