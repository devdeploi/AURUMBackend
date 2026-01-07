import express from 'express';
import { verifyBankAccount, verifyPAN } from '../controllers/kycController.js';

const router = express.Router();

router.post('/verify-bank', verifyBankAccount);
router.post('/verify-pan', verifyPAN);

export default router;
