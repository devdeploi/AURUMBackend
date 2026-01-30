import express from 'express';
import { registerFCMToken } from '../controllers/fcmController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register-token',registerFCMToken);

export default router;
