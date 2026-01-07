import express from 'express';
import { createChitPlan, getMerchantChitPlans, getChitPlans, subscribeToChitPlan, updateChitPlan, deleteChitPlan } from '../controllers/chitPlanController.js';
import { protect, merchantOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
    .get(getChitPlans)
    .post(protect, merchantOnly, createChitPlan);

router.get('/merchant/:id', getMerchantChitPlans);
// router.get('/merchant/:id', getMerchantChitPlans); // Already there
router.route('/:id')
    .put(protect, merchantOnly, updateChitPlan)
    .delete(protect, merchantOnly, deleteChitPlan);

router.post('/:id/subscribe', protect, subscribeToChitPlan);

export default router;
