const jwt = require('jsonwebtoken');
const pool = require('../db');

const protect = async (req, res, next) => { // Added 'async' here
    let token = req.headers.authorization;

    if (token && token.startsWith('Bearer')) {
        try {
            token = token.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

            // Assuming 'pool' is available for database queries
            // If 'pool' is not defined, this will cause an error.
            // You might need to add 'const pool = require('../config/db');' or similar at the top.
            const result = await pool.query(`
                SELECT u.*,
                    (SELECT COUNT(*)::int FROM users WHERE reporting_manager_id = u.id) as reports_count
                FROM users u
                WHERE u.id = $1
            `, [decoded.id]);

            if (result.rows.length === 0) {
                return res.status(401).json({ message: 'User not found' });
            }

            req.user = result.rows[0]; // Set req.user to the full user object from the database
            next();
        } catch (error) {
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    } else {
        res.status(401).json({ message: 'No token, authorization denied' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }
};

const isAdminOrManager = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'manager' || req.user.is_manager === true)) {
        next();
    } else {
        res.status(403).json({ message: 'Access denied. Admin or Manager privileges required.' });
    }
};

module.exports = { protect, isAdmin, isAdminOrManager };