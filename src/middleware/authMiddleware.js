import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Merchant from '../models/Merchant.js';

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Check if user or merchant
            req.user = await User.findById(decoded.id).select('-password');
            if (!req.user) {
                req.merchant = await Merchant.findById(decoded.id).select('-password');
                if (req.merchant) {
                    req.user = req.merchant; // Unify for simplicity if needed, or keep separate
                    req.user.role = 'merchant';
                }
            }

            if (!req.user && !req.merchant) {
                throw new Error('Not authorized, token failed');
            }

            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const merchantOnly = (req, res, next) => {
    if (req.user && req.user.role === 'merchant') {
        next();
    } else {
        res.status(401).json({ message: 'Not authorized as a merchant' });
    }
};

export { protect, merchantOnly };
