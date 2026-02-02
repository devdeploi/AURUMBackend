import express from 'express';
import {
    createPayment,
    executePayment,
    cancelPayment,
    createSubscriptionOrder,
    verifySubscriptionPayment,
    createInstallmentOrder,
    verifyInstallmentPayment,
    requestOfflinePayment,
    getPendingOfflinePayments,
    approveOfflinePayment,
    rejectOfflinePayment,
    recordManualPayment,
    getSubscriberPaymentHistory
} from '../controllers/paymentController.js';
import { protect, merchantOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/pay', protect, createPayment);
router.get('/success', executePayment);
router.get('/cancel', cancelPayment);

router.post('/create-subscription-order', createSubscriptionOrder);
router.post('/verify-subscription-payment', verifySubscriptionPayment);

router.post('/create-installment-order', protect, createInstallmentOrder);
router.post('/verify-installment', protect, verifyInstallmentPayment);

// Offline / Manual Payments
router.post('/offline/request', protect, requestOfflinePayment);
router.get('/offline/pending', protect, merchantOnly, getPendingOfflinePayments);
router.put('/offline/:id/approve', protect, merchantOnly, approveOfflinePayment);
router.put('/offline/:id/reject', protect, merchantOnly, rejectOfflinePayment);
router.post('/offline/record', protect, merchantOnly, recordManualPayment);
router.get('/history/:chitPlanId/:userId', protect, merchantOnly, getSubscriberPaymentHistory);

export default router;
