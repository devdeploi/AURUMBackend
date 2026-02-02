import express from 'express';
import {
    getMerchants, getMerchantById, updateMerchantStatus, deleteMerchant, updateMerchantProfile,
    renewMerchantPlan, createRenewalOrder, verifyRenewalPayment
} from '../controllers/merchantController.js';
import { protect, merchantOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// Payment Routes
// Payment Routes
router.post('/create-renewal-order', protect, merchantOnly, createRenewalOrder);
router.post('/verify-renewal', protect, merchantOnly, verifyRenewalPayment);

router.post('/renew-plan', protect, merchantOnly, renewMerchantPlan); // KEEP this for manual/admin override if needed or legacy

router.get('/', protect, getMerchants); // Typically admin only, but protect for now
router.put('/:id', protect, updateMerchantProfile);
router.get('/:id', protect, getMerchantById);
router.put('/:id/status', protect, updateMerchantStatus); // Protect this in real app, maybe admin only
router.delete('/:id', protect, deleteMerchant);

export default router;
