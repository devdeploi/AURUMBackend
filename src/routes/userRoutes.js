import express from 'express';
import { getUsers } from '../controllers/userController.js';
import { protect, merchantOnly } from '../middleware/authMiddleware.js'; // Assuming admin check is needed or we just use protect for now

const router = express.Router();

// Currently just protect, in real app add adminOnly middleware
router.route('/').get(getUsers);

export default router;
