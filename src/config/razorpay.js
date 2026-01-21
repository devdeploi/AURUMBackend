import Razorpay from 'razorpay';
import dotenv from 'dotenv';
dotenv.config();

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_S6RoMCiZCpsLo7',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '6PGvVh2kjdaYFBjfsV2vKAez'
});

export default razorpay;
