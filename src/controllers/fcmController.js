import User from '../models/User.js';
import Merchant from '../models/Merchant.js';

// @desc    Register FCM Token
// @route   POST /api/users/fcm-token
// @access  Private (User/Merchant)
const registerFCMToken = async (req, res) => {
    const { fcmToken, role } = req.body;
    const userId = req.user._id;

    if (!fcmToken) {
        return res.status(400).json({ message: 'FCM Token is required' });
    }

    try {
        if (role === 'merchant') {
            await Merchant.findByIdAndUpdate(userId, { fcmToken });
        } else {
            await User.findByIdAndUpdate(userId, { fcmToken });
        }
        res.status(200).json({ message: 'FCM Token registered successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error registering FCM Token' });
    }
};

export { registerFCMToken };
