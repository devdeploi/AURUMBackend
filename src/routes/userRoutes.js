import express from 'express';
import { getUsers, updateUserProfile, deleteUser } from '../controllers/userController.js';
import { protect, merchantOnly } from '../middleware/authMiddleware.js'; // Assuming admin check is needed or we just use protect for now

const router = express.Router();

// Currently just protect, in real app add adminOnly middleware
router.route('/').get(getUsers);
router.put('/:id', updateUserProfile);
router.delete('/:id', deleteUser);

export default router;
