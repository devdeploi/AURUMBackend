import paypal from 'paypal-rest-sdk';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import Payment from '../models/Payment.js';
import ChitPlan from '../models/ChitPlan.js';
import Merchant from '../models/Merchant.js';

paypal.configure({
    'mode': process.env.PAYPAL_MODE || 'sandbox',
    'client_id': process.env.PAYPAL_CLIENT_ID,
    'client_secret': process.env.PAYPAL_CLIENT_SECRET
});

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder'
});

// @desc    Initiate PayPal Payment
// @route   POST /api/payments/pay
// @access  Private
const createPayment = async (req, res) => {
    const { chitPlanId, amount } = req.body;

    const chitPlan = await ChitPlan.findById(chitPlanId).populate('merchant');
    if (!chitPlan) {
        res.status(404).json({ message: 'Chit plan not found' });
        return;
    }

    const merchant = chitPlan.merchant;

    // KYC Verification Check (RBI Compliance)
    if (merchant.kycStatus !== 'verified') {
        res.status(403).json({
            message: 'Merchant is not verified to receive payments. Verification Status: ' + merchant.kycStatus
        });
        return;
    }

    if (!merchant.paypalEmail) {
        res.status(400).json({ message: 'Merchant does not have a PayPal account linked' });
        return;
    }

    // Convert amount to string and potentially currency (PayPal handles INR but sometimes restricts)
    // For safety in this demo, defaulting to USD if INR issues occur, but trying INR first
    const currency = 'USD'; // Using USD for sandbox reliability
    // In real app, exchange rate logic needed if amount is in INR

    const create_payment_json = {
        "intent": "sale",
        "payer": {
            "payment_method": "paypal"
        },
        "redirect_urls": {
            "return_url": `http://localhost:${process.env.PORT || 5000}/api/payments/success?userId=${req.user._id}&chitPlanId=${chitPlanId}&amount=${amount}`,
            "cancel_url": `http://localhost:${process.env.PORT || 5000}/api/payments/cancel`
        },
        "transactions": [{
            "item_list": {
                "items": [{
                    "name": `Chit Plan: ${chitPlan.planName}`,
                    "sku": chitPlanId,
                    "price": amount,
                    "currency": currency,
                    "quantity": 1
                }]
            },
            "amount": {
                "currency": currency,
                "total": amount
            },
            "description": `Payment for Chit Plan ${chitPlan.planName}`,
            "payee": {
                "email": merchant.paypalEmail
            }
        }]
    };

    paypal.payment.create(create_payment_json, function (error, payment) {
        if (error) {
            console.error(JSON.stringify(error));
            res.status(500).json({ message: 'PayPal Payment Creation Failed', error: error.response });
        } else {
            for (let i = 0; i < payment.links.length; i++) {
                if (payment.links[i].rel === 'approval_url') {
                    res.json({ approvalUrl: payment.links[i].href });
                    return;
                }
            }
            res.status(500).json({ message: 'Approval URL not found' });
        }
    });
};

// @desc    Execute PayPal Payment
// @route   GET /api/payments/success
// @access  Public (Callback)
const executePayment = async (req, res) => {
    const { paymentId, PayerID, userId, chitPlanId, amount } = req.query;

    const execute_payment_json = {
        "payer_id": PayerID,
        "transactions": [{
            "amount": {
                "currency": "USD",
                "total": amount
            }
        }]
    };

    paypal.payment.execute(paymentId, execute_payment_json, async function (error, payment) {
        if (error) {
            console.error(error.response);
            res.status(500).json({ message: 'Payment Execution Failed' });
        } else {
            // Save payment to DB
            const transaction = new Payment({
                user: userId,
                merchant: payment.transactions[0].payee ? await getMerchantIdByEmail(payment.transactions[0].payee.email) : null, // Logic to get ID needs refinement if payee email isn't reliable source for ID lookup, but we have chitPlanId
                chitPlan: chitPlanId,
                amount: amount,
                paymentId: paymentId,
                status: 'Completed',
                paymentDetails: payment
            });

            // Better way to find merchant:
            const chitPlan = await ChitPlan.findById(chitPlanId);
            if (chitPlan) {
                transaction.merchant = chitPlan.merchant;
            }

            await transaction.save();

            res.json({ message: 'Payment Successful', payment });
            // In a real app, redirect to a frontend success page: 
            // res.redirect('http://localhost:3000/payment/success');
        }
    });
};

const cancelPayment = (req, res) => {
    res.json({ message: 'Payment Cancelled' });
};

// @desc    Create Razorpay Order for Subscription
// @route   POST /api/payments/create-subscription-order
// @access  Public
const createSubscriptionOrder = async (req, res) => {
    const { amount, currency = 'INR' } = req.body;

    // Remove any non-numeric characters from amount (e.g. "₹1500/mo" -> 1500)
    const numericAmount = parseFloat(amount.toString().replace(/[^0-9.]/g, ''));

    const options = {
        amount: Math.round(numericAmount * 100), // amount in paisa
        currency,
        receipt: `receipt_${Date.now()}`,
    };

    try {
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error("Razorpay Error:", error);
        res.status(500).json({ message: 'Razorpay Order Creation Failed', error });
    }
};

// @desc    Verify Razorpay Payment
// @route   POST /api/payments/verify-subscription-payment
// @access  Public
const verifySubscriptionPayment = async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder')
        .update(body.toString())
        .digest('hex');

    if (expectedSignature === razorpay_signature) {
        res.json({ status: 'success', message: 'Payment verified' });
    } else {
        res.status(400).json({ status: 'failure', message: 'Invalid signature' });
    }
};

export { createPayment, executePayment, cancelPayment, createSubscriptionOrder, verifySubscriptionPayment };
