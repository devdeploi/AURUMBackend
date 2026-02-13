import Merchant from '../models/Merchant.js';
import ChitPlan from '../models/ChitPlan.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import sendEmail from '../utils/sendEmail.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';

// @desc    Get all merchants
// @route   GET /api/merchants
// @access  Public
// @desc    Get all merchants
// @route   GET /api/merchants
// @access  Public
const getMerchants = async (req, res) => {
    const pageSize = Number(req.query.limit) || 10;
    const page = Number(req.query.page) || 1;

    // Filter by status (optional)
    const statusFilter = req.query.status
        ? { status: req.query.status }
        : {};

    // Filter by subscription status
    const subscriptionFilter = req.query.subscriptionStatus
        ? { subscriptionStatus: req.query.subscriptionStatus }
        : {};

    // Search by name (optional)
    const keywordFilter = req.query.keyword
        ? {
            name: {
                $regex: req.query.keyword,
                $options: 'i',
            },
        }
        : {};

    const filter = { ...statusFilter, ...subscriptionFilter, ...keywordFilter };

    const total = await Merchant.countDocuments(filter);

    // Sorting (default: newest first)
    const sort = req.query.sort
        ? { [req.query.sort]: -1 }
        : { createdAt: -1 };

    // EXCLUDE SENSITIVE FIELDS from List View
    const merchants = await Merchant.find(filter)
        .select('-password -razorpayKeyId -razorpayKeySecret -razorpayAccountId -bankDetails -gstin -panNumber -paymentId')
        .sort(sort)
        .limit(pageSize)
        .skip(pageSize * (page - 1));

    const totalPages = Math.ceil(total / pageSize);

    res.json({
        merchants,
        pagination: {
            page,
            pageSize,
            totalRecords: total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        },
    });
};


// @desc    Update merchant status
// @route   PUT /api/merchants/:id/status
// @access  Private/Admin
const updateMerchantStatus = async (req, res) => {
    const { status } = req.body; // 'Approved', 'Rejected', 'Pending'
    const merchant = await Merchant.findById(req.params.id);

    if (merchant) {
        const oldStatus = merchant.status;
        merchant.status = status;

        if (status === 'Approved' && oldStatus !== 'Approved') {
            const now = new Date();
            const endDate = new Date(now);

            if (merchant.billingCycle === 'monthly') {
                endDate.setMonth(endDate.getMonth() + 1); // 1 Month validity
            } else {
                endDate.setFullYear(endDate.getFullYear() + 1); // 1 year validity
            }

            merchant.status = 'Approved';
            merchant.subscriptionStartDate = now;
            merchant.subscriptionExpiryDate = endDate;
            merchant.subscriptionStatus = 'active';

            // Generate PDF Password: First 4 letters of Name + Last 4 digits of Phone
            const namePart = merchant.name.substring(0, 4).replace(/\s+/g, '');
            const phonePart = merchant.phone.substring(merchant.phone.length - 4);
            const pdfPassword = `${namePart}${phonePart}`;



            // Generate Protected PDF
            const doc = new PDFDocument({
                userPassword: pdfPassword,
                ownerPassword: pdfPassword,
                permissions: {
                    printing: 'highResolution',
                    modifying: false,
                    copying: true
                },
                size: 'A4',
                margin: 30
            });

            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));

            // Retrieve Original Password
            let originalPassword = '(The password you set during registration)';
            if (merchant.encryptedPassword) {
                originalPassword = decrypt(merchant.encryptedPassword);
            }

            // --- PROFESSIONAL PDF DESIGN ---
            const primaryColor = '#915200';
            const secondaryColor = '#555555';
            const lightColor = '#999999';
            const pageWidth = doc.page.width;
            const pageHeight = doc.page.height;
            const margin = 30;

            // 1. Header (Logo area)
            // Draw a subtle top bar
            doc.rect(0, 0, pageWidth, 15).fill(primaryColor);

            // Title / Logo
            doc.y = 45;
            doc.fontSize(28).font('Helvetica-Bold').fillColor(primaryColor).text('AURUM', { align: 'center' });
            doc.moveDown(0.2);
            doc.fontSize(10).font('Helvetica').fillColor(secondaryColor).text('PREMIUM JEWELRY MANAGEMENT', { align: 'center', characterSpacing: 2 });

            // Divider
            doc.moveDown(0.8);
            doc.lineWidth(1).strokeColor('#e0e0e0').moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke();
            doc.moveDown(1.5);

            // 2. Body Content
            doc.fontSize(11).font('Helvetica').fillColor('#333333').text(`Dear ${merchant.name},`, margin, doc.y, { align: 'left' });
            doc.moveDown(0.5);
            doc.fontSize(11).font('Helvetica').text('We are pleased to inform you that your merchant account has been approved. You now have full access to the Aurum platform.', {
                align: 'left',
                width: pageWidth - (margin * 2),
                lineGap: 3
            });
            doc.moveDown(1.5);

            // 3. Credentials Card/Box
            const boxHeight = 160;
            const boxWidth = 400; // Centered box width
            const boxX = (pageWidth - boxWidth) / 2; // Center horizontally
            const boxY = doc.y;

            // Background for credentials
            doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 5).fill('#fafafa');
            doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 5).stroke('#eeeeee');

            // Box Header
            let contentY = boxY + 20;
            doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text('Secure Login Credentials', boxX, contentY, { align: 'center', width: boxWidth });

            contentY += 35;
            const labelX = boxX + 40;
            const valueX = boxX + 130;
            const lineHeight = 25;

            // Login URL
            doc.fontSize(10).font('Helvetica-Bold').fillColor(secondaryColor).text('Login URL:', labelX, contentY);
            doc.font('Helvetica').fillColor('#0000cd').text('Click here to login', valueX, contentY, { link: `${process.env.FRONTEND_URL}/aurum/login`, underline: true });

            contentY += lineHeight;
            // Username
            doc.font('Helvetica-Bold').fillColor(secondaryColor).text('Username:', labelX, contentY);
            doc.font('Helvetica').fillColor('#000000').text(`${merchant.email}`, valueX, contentY);

            contentY += lineHeight;
            // Password
            doc.font('Helvetica-Bold').fillColor(secondaryColor).text('Password:', labelX, contentY);
            doc.font('Helvetica').fillColor('#000000').text(`${originalPassword}`, valueX, contentY);

            doc.y = boxY + boxHeight + 25;

            // 4. Important Note
            doc.fontSize(10).font('Helvetica-Oblique').fillColor('#d9534f').text('Important: Please handle these credentials with care. For your security, we recommend changing your password regularly.', margin, doc.y, { align: 'center', width: pageWidth - (margin * 2) });

            // 5. Footer (Copyright + Powered By)
            // Position at bottom of page
            const footerY = pageHeight - 80;

            doc.fontSize(9).font('Helvetica').fillColor(lightColor).text(`© ${new Date().getFullYear()} AURUM. All Rights Reserved.`, 0, footerY, { align: 'center', width: pageWidth });

            // --- END DESIGN ---

            doc.end();

            // Store buffer for email attachment
            const pdfBuffer = await new Promise((resolve) => {
                doc.on('end', () => {
                    resolve(Buffer.concat(buffers));
                });
            });

            await merchant.save();

            // Send Email Notification with Attachment
            if (oldStatus !== status) {
                const emailTemplate = `
                <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff; color: #333333;">
                    <div style="background-color: #915200; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 1px;">AURUM</h1>
                        <p style="color: #ffffff; margin: 5px 0 0; font-size: 12px; opacity: 0.9;">Premium Jewelry Management</p>
                    </div>

                    <div style="padding: 30px 20px;">
                        <h2 style="color: #28a745; margin-top: 0; font-size: 20px; text-align: center; margin-bottom: 20px;">Account Approved</h2>
                        
                        <p style="font-size: 14px; line-height: 1.6; color: #333333;">Dear <strong>${merchant.name}</strong>,</p>
                        <p style="font-size: 14px; line-height: 1.6; color: #333333;">We are pleased to inform you that your merchant account has been approved. You can now access the Aurum platform.</p>
                        
                        <div style="background-color: #f8f9fa; border-left: 4px solid #915200; padding: 15px; margin: 25px 0;">
                            <p style="font-size: 14px; margin: 0; font-weight: bold; color: #915200;">Secure Login Credentials Attached</p>
                            <p style="font-size: 13px; margin: 5px 0 0; color: #555;">For your security, we have attached a password-protected PDF containing your login details.</p>
                        </div>
                        
                        <div style="background-color: #fff; border: 1px dashed #cccccc; padding: 20px; border-radius: 6px; font-size: 13px;">
                            <strong style="color: #915200;">How to open the attachment:</strong><br/>
                            The password is the <strong>first 4 letters of your Name</strong> (case sensitive) followed by the <strong>last 4 digits of your Phone number</strong>.<br/>
                            <br/>
                            <em>Example: For "<strong>Arun</strong> Kumar" with phone "987654<strong>3210</strong>", the password is: <strong>Arun3210</strong></em>
                        </div>
                    </div>

                    <div style="background-color: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #666666; border-top: 1px solid #eeeeee; border-radius: 0 0 8px 8px;">
                        <p style="margin: 0 0 5px;">&copy; ${new Date().getFullYear()} AURUM. All rights reserved.</p>
                        <p style="margin: 0;">Powered by <a href="https://www.safprotech.com" target="_blank" style="color: #915200; text-decoration: none; font-weight: 500;">Safpro Technology Solutions</a></p>
                    </div>
                </div>
                `;

                try {
                    await sendEmail({
                        email: merchant.email,
                        subject: 'Account Approved - Login Credentials',
                        message: 'Your account has been approved. Please find your credentials in the attached PDF.',
                        html: emailTemplate,
                        attachments: [
                            {
                                filename: 'Aurum_Credentials.pdf',
                                content: pdfBuffer,
                                contentType: 'application/pdf'
                            }
                        ]
                    });
                } catch (error) {
                    console.error('Email send failed:', error);
                }
            }

        } else {
            // Handle other statuses (Rejected, etc.)
            if (oldStatus !== status) {
                const emailTemplate = `
                <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff; color: #333333;">
                    <div style="background-color: #915200; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 1px;">AURUM</h1>
                        <p style="color: #ffffff; margin: 5px 0 0; font-size: 12px; opacity: 0.9;">Premium Jewelry Management</p>
                    </div>

                    <div style="padding: 30px 20px;">
                        <h2 style="color: #333333; margin-top: 0; font-size: 20px; text-align: center; margin-bottom: 20px;">Status Update</h2>
                        <p style="font-size: 14px; line-height: 1.6; color: #333333;">Your account status has been updated to: <strong>${status}</strong>.</p>
                    </div>

                    <div style="background-color: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #666666; border-top: 1px solid #eeeeee; border-radius: 0 0 8px 8px;">
                        <p style="margin: 0 0 5px;">&copy; ${new Date().getFullYear()} AURUM. All rights reserved.</p>
                        <p style="margin: 0;">Powered by <a href="https://www.safprotech.com" target="_blank" style="color: #915200; text-decoration: none; font-weight: 500;">Safpro Technology Solutions</a></p>
                    </div>
                </div>`;

                try {
                    await sendEmail({
                        email: merchant.email,
                        subject: 'Account Status Update',
                        html: emailTemplate
                    });
                } catch (error) {
                    console.error('Email send failed:', error);
                }
            }
            await merchant.save();
        }

        res.json(merchant); // Use merchant instead of updatedMerchant as it's saved already
    } else {
        res.status(404).json({ message: 'Merchant not found' });
    }
};

// @desc    Get merchant by ID
// @route   GET /api/merchants/:id
// @access  Public
const getMerchantById = async (req, res) => {
    const merchant = await Merchant.findById(req.params.id).select('-password');
    if (merchant) {
        // Check if requester is the merchant owner
        const isOwner = req.user && req.user._id.toString() === merchant._id.toString();
        const isAdmin = req.user && req.user.role === 'admin'; // Assuming admin role exists

        if (isOwner || isAdmin) {
            res.json(merchant);
        } else {
            // Strip sensitive fields
            const safeMerchant = merchant.toObject({ getters: true });
            delete safeMerchant.razorpayKeyId;
            delete safeMerchant.razorpayKeySecret;
            delete safeMerchant.razorpayAccountId;
            delete safeMerchant.bankDetails;
            delete safeMerchant.panNumber;
            delete safeMerchant.gstin;
            delete safeMerchant.paymentId;

            res.json(safeMerchant);
        }
    } else {
        res.status(404).json({ message: 'Merchant not found' });
    }
};

// @desc    Delete merchant
// @route   DELETE /api/merchants/:id
// @access  Private/Admin
const deleteMerchant = async (req, res) => {
    const merchant = await Merchant.findById(req.params.id);

    if (merchant) {
        await merchant.deleteOne();
        res.json({ message: 'Merchant removed' });
    } else {
        res.status(404).json({ message: 'Merchant not found' });
    }
};

// @desc    Update merchant profile
// @route   PUT /api/merchants/:id
// @access  Private
const updateMerchantProfile = async (req, res) => {
    const merchant = await Merchant.findById(req.params.id);

    if (merchant) {
        const newPlan = req.body.plan;
        const newCycle = req.body.billingCycle;
        let recalculateSubscription = false;

        if ((newPlan && newPlan !== merchant.plan) || (newCycle && newCycle !== merchant.billingCycle)) {
            recalculateSubscription = true;
        }

        merchant.name = req.body.name || merchant.name;
        merchant.phone = req.body.phone || merchant.phone;
        merchant.address = req.body.address || merchant.address;
        merchant.plan = req.body.plan || merchant.plan;
        merchant.billingCycle = req.body.billingCycle || merchant.billingCycle;
        merchant.paymentId = req.body.paymentId || merchant.paymentId;

        if (recalculateSubscription) {
            const now = new Date();
            const expiry = new Date(now);
            if (merchant.billingCycle === 'monthly') {
                expiry.setMonth(expiry.getMonth() + 1);
            } else {
                expiry.setFullYear(expiry.getFullYear() + 1);
            }
            merchant.subscriptionStartDate = now;
            merchant.subscriptionExpiryDate = expiry;
            merchant.subscriptionStatus = 'active';
            merchant.upcomingPlan = undefined;
            merchant.planSwitchDate = undefined;
        }

        // Update Razorpay Keys
        if (req.body.razorpayKeyId) {
            merchant.razorpayKeyId = req.body.razorpayKeyId;
        }
        if (req.body.razorpayKeySecret) {
            merchant.razorpayKeySecret = req.body.razorpayKeySecret;
        }

        // Update Bank Details (Keeping for record/future use if needed, but primary is now Razorpay Keys)
        if (req.body.bankDetails) {
            merchant.bankDetails = {
                ...merchant.bankDetails, // Keep existing fields
                accountHolderName: req.body.bankDetails.accountHolderName || merchant.bankDetails?.accountHolderName,
                accountNumber: req.body.bankDetails.accountNumber || merchant.bankDetails?.accountNumber,
                ifscCode: req.body.bankDetails.ifscCode || merchant.bankDetails?.ifscCode,
                bankName: req.body.bankDetails.bankName || merchant.bankDetails?.bankName,
                branchName: req.body.bankDetails.branchName || merchant.bankDetails?.branchName,
                verifiedName: req.body.bankDetails.verifiedName || merchant.bankDetails?.verifiedName,
                verificationStatus: req.body.bankDetails.verificationStatus || merchant.bankDetails?.verificationStatus || 'pending'
            };
        }

        // Update PAN Details
        if (req.body.gstin) {
            merchant.gstin = req.body.gstin;
        }

        if (req.body.legalName) {
            merchant.legalName = req.body.legalName;
        }

        if (req.body.panNumber) {
            merchant.panNumber = req.body.panNumber;
        }

        if (req.body.addressProof) {
            merchant.addressProof = req.body.addressProof;
        }

        if (req.body.shopImages) {
            merchant.shopImages = req.body.shopImages;
        }

        if (req.body.hasOwnProperty('shopLogo')) {
            merchant.shopLogo = req.body.shopLogo;
        }

        const updatedMerchant = await merchant.save();
        res.json(updatedMerchant);
    } else {
        res.status(404).json({ message: 'Merchant not found' });
    }
};

// @desc    Renew merchant plan
// @route   POST /api/merchants/renew-plan
// @access  Private/Merchant
const renewMerchantPlan = async (req, res) => {
    const { plan } = req.body; // 'Standard' or 'Premium'

    // Ensure req.user exists (middleware should handle this)
    if (!req.user || !req.user._id) {
        return res.status(401).json({ message: 'Not authorized' });
    }

    const merchantId = req.user._id;
    const merchant = await Merchant.findById(merchantId);

    if (!merchant) {
        return res.status(404).json({ message: 'Merchant not found' });
    }

    const chitPlanCount = await ChitPlan.countDocuments({ merchant: merchantId });

    // "if his chit has under 3 then he can selected any plan"
    // Basic: 3 Chits, Standard: 6 Chits, Premium: 9+ Chits
    if (chitPlanCount > 3 && plan === 'Basic') {
        return res.status(400).json({ message: 'You have more than 3 chits. You must choose Standard or Premium.' });
    }
    if (chitPlanCount > 6 && plan === 'Standard') {
        return res.status(400).json({ message: 'You have more than 6 chits. You must choose Premium.' });
    }

    // Update Plan and Subscription

    const now = new Date();
    const currentExpiry = merchant.subscriptionExpiryDate ? new Date(merchant.subscriptionExpiryDate) : new Date(0);
    let newExpiryDate;

    // Check for Scheduled Downgrade
    if (currentExpiry > now && merchant.plan === 'Premium' && plan === 'Standard') {
        merchant.upcomingPlan = 'Standard';
        merchant.planSwitchDate = currentExpiry;

        newExpiryDate = new Date(currentExpiry);
        newExpiryDate.setDate(newExpiryDate.getDate() + 30);
    } else {
        merchant.plan = plan;
        merchant.upcomingPlan = undefined;
        merchant.planSwitchDate = undefined;

        if (currentExpiry > now) {
            newExpiryDate = new Date(currentExpiry);
            newExpiryDate.setDate(newExpiryDate.getDate() + 30);
        } else {
            newExpiryDate = new Date(now);
            newExpiryDate.setDate(newExpiryDate.getDate() + 30);
        }
    }

    merchant.subscriptionStartDate = now;
    merchant.subscriptionExpiryDate = newExpiryDate;
    merchant.subscriptionStatus = 'active';

    const updatedMerchant = await merchant.save();

    res.json(updatedMerchant);
};

// @desc    Create Razorpay Order for Renewal
// @route   POST /api/merchants/create-renewal-order
// @access  Private/Merchant
const createRenewalOrder = async (req, res) => {
    const { plan, billingCycle } = req.body;
    const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Define Prices
    let amount = 0;
    if (plan === 'Basic') {
        amount = billingCycle === 'yearly' ? 17700 : 1770; // 15000 or 1500 + 18% GST
    } else if (plan === 'Standard') {
        amount = billingCycle === 'yearly' ? 29500 : 2950; // +18% GST
    } else if (plan === 'Premium') {
        amount = billingCycle === 'yearly' ? 41300 : 4130;  // +18% GST
    } else {
        return res.status(400).json({ message: 'Invalid plan selected' });
    }

    const options = {
        amount: amount * 100, // amount in paisa
        currency: "INR",
        receipt: `rnw_${Date.now()} `, // Shortened receipt ID
    };

    try {
        const order = await instance.orders.create(options);
        res.json({ order, keyId: process.env.RAZORPAY_KEY_ID });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Order creation failed' });
    }
};

// @desc    Verify Razorpay Payment and Renew
// @route   POST /api/merchants/verify-renewal
// @access  Private/Merchant
const verifyRenewalPayment = async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, billingCycle } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");

    if (expectedSignature === razorpay_signature) {
        // Payment Success
        const merchant = await Merchant.findById(req.user._id);

        // 1. Update Payment Info
        // In a real app, save to a Payment Log collection

        // 2. Renew Subscription
        // 2. Renew Subscription

        const now = new Date();
        const currentExpiry = merchant.subscriptionExpiryDate ? new Date(merchant.subscriptionExpiryDate) : new Date(0);
        let newExpiryDate;

        // Check for Scheduled Downgrade (Premium -> Standard) while active
        if (currentExpiry > now && merchant.plan === 'Premium' && plan === 'Standard') {
            // Queue the downgrade
            merchant.upcomingPlan = 'Standard';
            merchant.planSwitchDate = currentExpiry; // Access until this date is Premium, then Standard

            // Extend total validity: Remaining Premium Days + 30 Days Standard
            // Extend total validity: Remaining Premium Days + Duration based on cycle
            newExpiryDate = new Date(currentExpiry);
            if (billingCycle === 'yearly') {
                newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);
            } else {
                newExpiryDate.setDate(newExpiryDate.getDate() + 30);
            }

            // NOTE: merchant.plan remains 'Premium' until planSwitchDate
        } else {
            // Immediate Update (Upgrade or Continued Same Plan or Expired)
            merchant.plan = plan;

            // Clear any scheduled switches if we are doing an immediate update/upgrade
            merchant.upcomingPlan = undefined;
            merchant.planSwitchDate = undefined;

            // Calculate Expiry
            // Calculate Expiry
            if (currentExpiry > now) {
                newExpiryDate = new Date(currentExpiry);
            } else {
                newExpiryDate = new Date(now);
            }

            // Add Duration based on billing cycle
            if (billingCycle === 'yearly') {
                newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);
            } else {
                newExpiryDate.setDate(newExpiryDate.getDate() + 30);
            }
        }

        merchant.subscriptionStartDate = now; // Track last payment/renewal date 
        merchant.subscriptionExpiryDate = newExpiryDate;
        merchant.subscriptionStatus = 'active';
        if (billingCycle) merchant.billingCycle = billingCycle;

        const updated = await merchant.save();

        res.json({ success: true, merchant: updated });
    } else {
        res.status(400).json({ success: false, message: "Invalid Signature" });
    }
};

export {
    getMerchants,
    getMerchantById,
    updateMerchantStatus,
    deleteMerchant,
    updateMerchantProfile,
    renewMerchantPlan,
    createRenewalOrder,
    verifyRenewalPayment
};
