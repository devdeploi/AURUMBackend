import express from 'express';
import { getUsers, updateUserProfile, deleteUser, getUserById } from '../controllers/userController.js';
import { protect, merchantOnly } from '../middleware/authMiddleware.js'; // Assuming admin check is needed or we just use protect for now

const router = express.Router();

// Currently just protect, in real app add adminOnly middleware
router.route('/').get(protect, getUsers);
router.route('/:id').get(protect, getUserById).put(protect, updateUserProfile).delete(protect, deleteUser);

export default router;
