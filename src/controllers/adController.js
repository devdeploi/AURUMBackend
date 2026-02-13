import Ad from '../models/Ad.js';
import Merchant from '../models/Merchant.js';
import ChitPlan from '../models/ChitPlan.js';

// @desc    Create a new ad
// @route   POST /api/ads
// @access  Private (Merchant Premium Only)
const createAd = async (req, res) => {
    try {
        const { imageUrls, link, startDate, endDate, displayFrequency, title, description } = req.body;
        const merchant = await Merchant.findById(req.merchant._id);

        if (merchant.plan !== 'Premium') {
            return res.status(403).json({ message: 'Custom Ads are available only for Premium plan merchants.' });
        }

        const existingAdCount = await Ad.countDocuments({ merchant: req.merchant._id });
        if (existingAdCount >= 1) {
            return res.status(400).json({ message: 'Limit reached: You can only have 1 active Custom Ad campaign.' });
        }

        const ad = await Ad.create({
            merchant: req.merchant._id,
            imageUrls: imageUrls || [], // Expecting array
            link,
            title,
            description,
            startDate,
            endDate,
            displayFrequency: displayFrequency || 15,
            isActive: true,
            status: 'active'
        });

        res.status(201).json(ad);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};



// @desc    Get all ads for logged in merchant
// @route   GET /api/ads/my-ads
// @access  Private (Merchant)
const getMyAds = async (req, res) => {
    try {
        const ads = await Ad.find({ merchant: req.merchant._id }).sort({ createdAt: -1 });
        res.json(ads);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update ad status (Active/Inactive)
// @route   PATCH /api/ads/:id/status
// @access  Private (Merchant)
const toggleAdStatus = async (req, res) => {
    try {
        const ad = await Ad.findOne({ _id: req.params.id, merchant: req.merchant._id });

        if (!ad) {
            return res.status(404).json({ message: 'Ad not found' });
        }

        const newStatus = req.body.status; // 'active' or 'inactive'
        if (newStatus) {
            ad.status = newStatus;
            ad.isActive = newStatus === 'active';
        } else {
            // Toggle if no specific status sent
            ad.isActive = !ad.isActive;
            ad.status = ad.isActive ? 'active' : 'inactive';
        }

        await ad.save();
        res.json(ad);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update an ad
// @route   PUT /api/ads/:id
// @access  Private (Merchant)
const updateAd = async (req, res) => {
    try {
        const { imageUrls, link, startDate, endDate, displayFrequency, title, description } = req.body;
        const ad = await Ad.findOne({ _id: req.params.id, merchant: req.merchant._id });

        if (!ad) {
            return res.status(404).json({ message: 'Ad not found' });
        }

        // Update fields if provided
        if (imageUrls) ad.imageUrls = imageUrls; // Replace images
        if (link !== undefined) ad.link = link;
        if (title !== undefined) ad.title = title;
        if (description !== undefined) ad.description = description;
        if (startDate) ad.startDate = startDate;
        if (endDate) ad.endDate = endDate;
        if (displayFrequency) ad.displayFrequency = displayFrequency;

        const updatedAd = await ad.save();
        res.json(updatedAd);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete an ad
// @route   DELETE /api/ads/:id
// @access  Private (Merchant)
const deleteAd = async (req, res) => {
    try {
        const ad = await Ad.findOneAndDelete({ _id: req.params.id, merchant: req.merchant._id });

        if (!ad) {
            return res.status(404).json({ message: 'Ad not found' });
        }

        res.json({ message: 'Ad removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get active ads for user dashboard
// @route   GET /api/ads/feed
// @access  Private (User)
const getAdsFeed = async (req, res) => {
    try {
        const now = new Date();
        const userId = req.user._id;

        // 1. Find subscribed merchants
        // We look for plans where this user is an active subscriber
        const subscriptions = await ChitPlan.find({
            'subscribers.user': userId
            // 'subscribers.status': 'active' 
        }).select('merchant');

        const merchantIds = [...new Set(subscriptions.map(sub => sub.merchant.toString()))];

        let ads = [];

        if (merchantIds.length > 0) {
            const potentialAds = await Ad.find({
                merchant: { $in: merchantIds },
                status: 'active',
                startDate: { $lte: now },
                endDate: { $gte: now }
            })
                .populate('merchant', 'name shopLogo plan')
                .sort({ createdAt: -1 });

            // Filter out ads from non-premium merchants
            ads = potentialAds.filter(ad => ad.merchant && ad.merchant.plan === 'Premium');
        }

        // 2. Fallback to Brand Ads if no merchant ads found
        if (ads.length === 0) {
            // Return static brand ads structure
            // These images should exist in frontend or be served by backend public folder
            ads = [
                {
                    _id: 'brand_schoolhub',
                    imageUrls: ['/images/ads/schoolhub_banner.png'],
                    link: 'https://www.safprotech.com/Productsview',
                    displayFrequency: 10,
                    isBrandAd: true
                },
                {
                    _id: 'brand_quickpro',
                    imageUrls: ['/images/ads/quickpro_banner.png'],
                    link: 'https://www.safprotech.com/Productsview',
                    displayFrequency: 15,
                    isBrandAd: true
                }
            ];
        }

        res.json(ads);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export { createAd, getMyAds, toggleAdStatus, updateAd, deleteAd, getAdsFeed };
