import express from 'express';
import {
    getMerchants, getMerchantById, updateMerchantStatus, deleteMerchant, updateMerchantProfile,
    renewMerchantPlan, createRenewalOrder, verifyRenewalPayment
} from '../controllers/merchantController.js';
import { protect, merchantOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// Payment Routes
router.post('/create-renewal-order', createRenewalOrder);
router.post('/verify-renewal', verifyRenewalPayment);

router.post('/renew-plan', renewMerchantPlan); // KEEP this for manual/admin override if needed or legacy

router.get('/', getMerchants);
router.put('/:id', updateMerchantProfile);
router.get('/:id', getMerchantById);
router.put('/:id/status', updateMerchantStatus); // Protect this in real app
router.delete('/:id', deleteMerchant);

export default router;
