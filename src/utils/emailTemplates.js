
const getBaseTemplate = (title, bodyContent) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: 20px; margin-bottom: 20px;">
        <div style="background: linear-gradient(135deg, #f3e9bd 0%, #ebdc87 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: #915200; margin: 0; font-size: 28px; font-weight: bold; letter-spacing: 1px;">A U R U M</h1>
        </div>
        
        <div style="padding: 30px 20px; color: #333333;">
            <h2 style="color: #915200; margin-top: 0; margin-bottom: 20px; font-size: 22px; border-bottom: 2px solid #f3e9bd; padding-bottom: 10px;">${title}</h2>
            <div style="font-size: 16px; line-height: 1.6;">
                ${bodyContent}
            </div>
        </div>
        
        <div style="background-color: #333333; padding: 20px; text-align: center; color: #888888; font-size: 12px;">
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} Jewel App. All rights reserved.</p>
            <p style="margin: 5px 0 0;">This is an automated message, please do not reply.</p>
        </div>
    </div>
</body>
</html>
`;

export const paymentRequestTemplate = (userName, amount, planName, date) => {
    const subject = 'Payment Request Received';
    const content = `
        <p>Hello <strong>${userName}</strong>,</p>
        <p>Your offline payment request has been received and is pending merchant approval.</p>
        <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
            <tr style="background-color: #f9f9f9;">
                <td style="padding: 10px; border: 1px solid #eee;"><strong>Plan:</strong></td>
                <td style="padding: 10px; border: 1px solid #eee;">${planName}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border: 1px solid #eee;"><strong>Amount:</strong></td>
                <td style="padding: 10px; border: 1px solid #eee;">₹${amount}</td>
            </tr>
            <tr style="background-color: #f9f9f9;">
                <td style="padding: 10px; border: 1px solid #eee;"><strong>Date:</strong></td>
                <td style="padding: 10px; border: 1px solid #eee;">${new Date(date).toLocaleDateString()}</td>
            </tr>
        </table>
        <p>You will be notified once the merchant approves this request.</p>
    `;
    return { subject, html: getBaseTemplate(subject, content) };
};

export const paymentRequestMerchantTemplate = (merchantName, userName, amount, planName) => {
    const subject = 'New Payment Request';
    const content = `
        <p>Hello <strong>${merchantName}</strong>,</p>
        <p>You have received a new offline payment request from <strong>${userName}</strong>.</p>
        <div style="background-color: #fffbf0; border-left: 4px solid #915200; padding: 15px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Plan:</strong> ${planName}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${amount}</p>
        </div>
        <p>Please log in to your dashboard to review and approve this payment.</p>
        <div style="text-align: center; margin-top: 25px;">
            <a href="#" style="background-color: #915200; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 25px; font-weight: bold;">Go to Dashboard</a>
        </div>
    `;
    return { subject, html: getBaseTemplate(subject, content) };
};

export const paymentApprovedTemplate = (userName, amount, planName) => {
    const subject = 'Payment Approved';
    const content = `
        <p>Hello <strong>${userName}</strong>,</p>
        <p style="color: #28a745; font-weight: bold;">Great news! Your payment has been approved.</p>
        <p>Your payment for <strong>${planName}</strong> has been successfully verified by the merchant.</p>
        <div style="background-color: #f0fff4; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px; color: #155724;">₹${amount}</h3>
            <p style="margin: 0; color: #155724;">Status: <span style="font-weight: bold;">APPROVED</span></p>
        </div>
        <p>Your subscription progress has been updated.</p>
    `;
    return { subject, html: getBaseTemplate(subject, content) };
};

export const paymentApprovedMerchantTemplate = (merchantName, userName, amount, planName) => {
    const subject = 'Payment Action Confirmed';
    const content = `
        <p>Hello <strong>${merchantName}</strong>,</p>
        <p>You have successfully approved a payment of <strong>₹${amount}</strong> from <strong>${userName}</strong> for <strong>${planName}</strong>.</p>
        <p>This transaction has been recorded in your ledger.</p>
    `;
    return { subject, html: getBaseTemplate(subject, content) };
};

export const paymentRejectedTemplate = (userName, amount, planName) => {
    const subject = 'Payment Request Returned';
    const content = `
        <p>Hello <strong>${userName}</strong>,</p>
        <p style="color: #dc3545; font-weight: bold;">Update on your payment request.</p>
        <p>Your offline payment request for <strong>${planName}</strong> (₹${amount}) has been declined by the merchant.</p>
        <p>Please contact the merchant for more details or submit a new request with valid proof.</p>
    `;
    return { subject, html: getBaseTemplate(subject, content) };
};

export const planCreatedMerchantTemplate = (merchantName, planName) => {
    const subject = 'Plan Created Successfully';
    const content = `
        <p>Hello <strong>${merchantName}</strong>,</p>
        <p>Your new Chit Plan <strong>${planName}</strong> has been successfully created and is now live!</p>
        <p>Users can now view and subscribe to this plan.</p>
        <div style="margin-top: 20px;">
            <p><strong>Next Steps:</strong></p>
            <ul>
                <li>Share your plan with potential customers.</li>
                <li>Monitor subscriptions in your dashboard.</li>
            </ul>
        </div>
    `;
    return { subject, html: getBaseTemplate(subject, content) };
};

export const subscriptionSuccessTemplate = (userName, planName, merchantName) => {
    const subject = 'Subscription Confirmed';
    const content = `
        <p>Hello <strong>${userName}</strong>,</p>
        <p style="font-size: 18px;">Welcome aboard!</p>
        <p>You have successfully subscribed to <strong>${planName}</strong> by <strong>${merchantName}</strong>.</p>
        <p>Thank you for choosing us for your jewelry savings journey.</p>
    `;
    return { subject, html: getBaseTemplate(subject, content) };
};

export const subscriptionAlertMerchantTemplate = (merchantName, userName, planName) => {
    const subject = 'New Subscriber Alert';
    const content = `
        <p>Hello <strong>${merchantName}</strong>,</p>
        <p>You have a new subscriber!</p>
        <p><strong>${userName}</strong> has just joined your <strong>${planName}</strong> plan.</p>
        <p>View their details in your dashboard.</p>
    `;
    return { subject, html: getBaseTemplate(subject, content) };
};
