import express from 'express';
import { authUser, registerUser, authMerchant, registerMerchant, forgotPassword, resetPassword, verifyOtp, checkEmailExists, verifyMerchantLoginOtp, sendLoginOtp, sendRegistrationOtp, verifyRegistrationOtp } from '../controllers/authController.js';

const router = express.Router();

router.post('/users/login', authUser);
router.post('/users', registerUser);
router.post('/merchants/login', authMerchant);
router.post('/merchants', registerMerchant);
router.post('/merchants/verify-login-otp', verifyMerchantLoginOtp);
router.post('/check-email', checkEmailExists);

router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);
router.post('/merchants/send-login-otp', sendLoginOtp);
router.post('/merchants/send-reg-otp', sendRegistrationOtp);
router.post('/merchants/verify-reg-otp', verifyRegistrationOtp);

export default router;