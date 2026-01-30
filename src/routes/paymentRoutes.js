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

router.post('/pay', createPayment);
router.get('/success', executePayment);
router.get('/cancel', cancelPayment);

router.post('/create-subscription-order', createSubscriptionOrder);
router.post('/verify-subscription-payment', verifySubscriptionPayment);

router.post('/create-installment-order', createInstallmentOrder);
router.post('/verify-installment', verifyInstallmentPayment);

// Offline / Manual Payments
router.post('/offline/request', requestOfflinePayment);
router.get('/offline/pending', getPendingOfflinePayments);
router.put('/offline/:id/approve', approveOfflinePayment);
router.put('/offline/:id/reject', rejectOfflinePayment);
router.post('/offline/record', recordManualPayment);
router.get('/history/:chitPlanId/:userId', getSubscriberPaymentHistory);

export default router;
