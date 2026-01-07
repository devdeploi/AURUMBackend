import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/User.js';
import connectDB from './src/config/db.js';

dotenv.config();

connectDB();

const seedAdmin = async () => {
    try {
        const adminExists = await User.findOne({ email: 'admin@jewel.com' });

        if (adminExists) {
            console.log('Admin user already exists');
            process.exit();
        }

        await User.create({
            name: 'Maazu Eache',
            email: 'admin@jewel.com',
            password: 'Maaz@eache17', // User should change this
            role: 'admin',
            phone: '8428676150'
        });

        console.log('Admin user created successfully');
        console.log('Email: admin@jewel.com');
        console.log('Password: Maaz@eache17');
        process.exit();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

seedAdmin();
