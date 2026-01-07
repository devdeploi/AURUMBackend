import express from 'express';
import { createPayment, executePayment, cancelPayment, createSubscriptionOrder, verifySubscriptionPayment } from '../controllers/paymentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/pay', protect, createPayment);
router.get('/success', executePayment);
router.get('/cancel', cancelPayment);

router.post('/create-subscription-order', createSubscriptionOrder);
router.post('/verify-subscription-payment', verifySubscriptionPayment);

export default router;
