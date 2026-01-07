import express from 'express';
import { getMerchants, getMerchantById, updateMerchantStatus, deleteMerchant, updateMerchantProfile } from '../controllers/merchantController.js';

const router = express.Router();

router.get('/', getMerchants);
router.put('/:id', updateMerchantProfile);
router.get('/:id', getMerchantById);
router.put('/:id/status', updateMerchantStatus); // Protect this in real app
router.delete('/:id', deleteMerchant);

export default router;
