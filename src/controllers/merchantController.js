import Merchant from '../models/Merchant.js';
import { encrypt } from '../utils/encryption.js';

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

    // Search by name (optional)
    const keywordFilter = req.query.keyword
        ? {
            name: {
                $regex: req.query.keyword,
                $options: 'i',
            },
        }
        : {};

    const filter = { ...statusFilter, ...keywordFilter };

    const total = await Merchant.countDocuments(filter);

    // Sorting (default: newest first)
    const sort = req.query.sort
        ? { [req.query.sort]: -1 }
        : { createdAt: -1 };

    const merchants = await Merchant.find(filter)
        .select('-password')
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
        merchant.status = status;
        const updatedMerchant = await merchant.save();
        res.json(updatedMerchant);
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
        res.json(merchant);
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
        merchant.name = req.body.name || merchant.name;
        merchant.phone = req.body.phone || merchant.phone;
        merchant.address = req.body.address || merchant.address;
        merchant.plan = req.body.plan || merchant.plan;
        merchant.paymentId = req.body.paymentId || merchant.paymentId;

        if (req.body.bankDetails) {
            merchant.bankDetails = {
                accountName: req.body.bankDetails.accountName || merchant.bankDetails?.accountName,
                accountNumber: req.body.bankDetails.accountNumber || merchant.bankDetails?.accountNumber,
                ifscCode: req.body.bankDetails.ifscCode || merchant.bankDetails?.ifscCode,
                bankName: req.body.bankDetails.bankName || merchant.bankDetails?.bankName
            };
        }

        if (req.body.shopImages) {
            merchant.shopImages = req.body.shopImages;
        }

        const updatedMerchant = await merchant.save();
        res.json(updatedMerchant);
    } else {
        res.status(404).json({ message: 'Merchant not found' });
    }
};

export { getMerchants, getMerchantById, updateMerchantStatus, deleteMerchant, updateMerchantProfile };
