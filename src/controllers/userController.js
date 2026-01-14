import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res) => {
    const pageSize = Number(req.query.limit) || 10;
    const page = Number(req.query.page) || 1;

    // Filter to exclude admins, only show 'user' role (or just not admin)
    // Requirement: "user lsit dont display admin user just display user role only"
    const keyword = { role: 'user' };

    const count = await User.countDocuments({ ...keyword });
    const users = await User.find({ ...keyword })
        .limit(pageSize)
        .skip(pageSize * (page - 1));

    res.json({ users, page, pages: Math.ceil(count / pageSize), total: count });
};

// @desc    Update user profile
// @route   PUT /api/users/:id
// @access  Private
const updateUserProfile = async (req, res) => {
    const user = await User.findById(req.params.id);

    if (user) {
        user.name = req.body.name || user.name;
        user.email = req.body.email || user.email; // Usually emails shouldn't change without verify, but ok for now
        user.phone = req.body.phone || user.phone;
        user.address = req.body.address || user.address;
        user.profileImage = req.body.profileImage || user.profileImage;

        if (req.body.password) {
            user.password = req.body.password;
        }

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            phone: updatedUser.phone,
            address: updatedUser.address,
            profileImage: updatedUser.profileImage,
            token: generateToken(updatedUser._id),
            // token: generateToken(updatedUser._id), // Optional: refresh token
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

const deleteUser = async (req, res) => {
    const user = await User.findById(req.params.id);

    if (user) {
        await user.deleteOne();
        res.json({ message: 'User removed' });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

export { getUsers, updateUserProfile, deleteUser };
