import express from 'express';
import {
    createAd,
    getMyAds,
    toggleAdStatus,
    deleteAd,
    updateAd,
    getAdsFeed
} from '../controllers/adController.js';
import { protect, merchantOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// Merchant routes
router.post('/', protect, merchantOnly, createAd);
router.put('/:id', protect, merchantOnly, updateAd);
router.get('/my-ads', protect, merchantOnly, getMyAds);
router.patch('/:id/status', protect, merchantOnly, toggleAdStatus);
router.delete('/:id', protect, merchantOnly, deleteAd);

// User/Feed routes
router.get('/feed', protect, getAdsFeed);

export default router;
