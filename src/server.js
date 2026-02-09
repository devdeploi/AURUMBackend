import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import chitPlanRoutes from './routes/chitPlanRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import userRoutes from './routes/userRoutes.js';
import merchantRoutes from './routes/merchantRoutes.js';
import fcmRoutes from './routes/fcmRoutes.js';
import path from 'path';
import uploadRoutes from './routes/uploadRoutes.js';
import kycRoutes from './routes/kycRoutes.js';
import adRoutes from './routes/adRoutes.js';

dotenv.config();

connectDB();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use('/api/users', userRoutes);
app.use('/api/merchants', merchantRoutes);

app.use('/api', authRoutes); // Auth routes (login/register)
app.use('/api/chit-plans', chitPlanRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/notifications', fcmRoutes);
app.use('/api/ads', adRoutes);


const __dirname = path.resolve();
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));

const PORT = process.env.PORT || 5000;

app.listen(PORT, console.log(`Server running on port ${PORT}`));
