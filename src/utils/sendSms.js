import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();

const sendSms = async ({ phone, message }) => {
    try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;

        // Check for placeholder or missing credentials
        if (!accountSid || !authToken || accountSid.includes('placeholder') || authToken.includes('placeholder')) {
            console.log(`[Simulation] SMS to ${phone}: ${message}`);
            return { sid: 'simulated_sms_id', status: 'sent' };
        }

        const client = twilio(accountSid, authToken);

        const msg = await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone.startsWith('+') ? phone : `+91${phone}`
        });

        console.log(`SMS Sent: ${msg.sid}`);
        return msg;
    } catch (error) {
        // Log but do NOT throw, so the auth flow can continue even if SMS fails
        console.warn('Warning: Failed to send SMS via Twilio. (Check credentials). Continuing flow...');
        return null;
    }
};

export default sendSms;
