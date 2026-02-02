import express from 'express';
import { verifyBankAccount, verifyPAN } from '../controllers/kycController.js';
import { protect, merchantOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/verify-bank', protect, merchantOnly, verifyBankAccount);
router.post('/verify-pan', protect, merchantOnly, verifyPAN);

export default router;
