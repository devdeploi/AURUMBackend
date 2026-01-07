import User from '../models/User.js';

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

export { getUsers };
