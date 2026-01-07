import express from 'express';
import { authUser, registerUser, authMerchant, registerMerchant, forgotPassword, resetPassword, verifyOtp } from '../controllers/authController.js';

const router = express.Router();

router.post('/users/login', authUser);
router.post('/users', registerUser);
router.post('/merchants/login', authMerchant);
router.post('/merchants', registerMerchant);

router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

export default router;