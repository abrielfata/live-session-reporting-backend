const { query } = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AppError = require('../utils/appError');

/**
 * LOGIN CONTROLLER - EMAIL & PASSWORD
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Validasi input
        if (!email || !password) {
            return next(new AppError('Email and Password are required', 400, 'VALIDATION_ERROR'));
        }

        // 2. Validasi format email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return next(new AppError('Invalid email format', 400, 'VALIDATION_ERROR'));
        }

        // 3. Cari user berdasarkan email
        const userQuery = `
            SELECT id, telegram_user_id, username, full_name, email, role, 
                   is_active, is_approved, password_hash
            FROM users
            WHERE LOWER(email) = LOWER($1)
        `;
        
        const result = await query(userQuery, [email]);

        if (result.rows.length === 0) {
            return next(new AppError('Invalid email or password', 401, 'AUTH_INVALID'));
        }

        const user = result.rows[0];

        // 4. Cek password hash
        if (!user.password_hash) {
            return next(new AppError('Please set your password first', 401, 'AUTH_NO_PASSWORD'));
        }

        // 5. Verifikasi password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        
        if (!isPasswordValid) {
            return next(new AppError('Invalid email or password', 401, 'AUTH_INVALID'));
        }

        // 6. Cek approval
        if (!user.is_approved) {
            return next(new AppError('Your account is pending approval', 403, 'AUTH_PENDING'));
        }

        // 7. Cek status aktif
        if (!user.is_active) {
            return next(new AppError('Your account has been deactivated', 403, 'AUTH_INACTIVE'));
        }

        // 8. Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // 9. Response sukses
        console.log(`✅ User logged in: ${user.email} (${user.role})`);
        
        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    full_name: user.full_name,
                    role: user.role
                }
            }
        });

    } catch (error) {
        return next(error);
    }
};

/**
 * GET CURRENT USER
 */
const getCurrentUser = async (req, res) => {
    try {
        const userQuery = `
            SELECT id, telegram_user_id, username, full_name, email, role, 
                   created_at, is_active, is_approved
            FROM users
            WHERE id = $1
        `;
        
        const result = await query(userQuery, [req.user.id]);

        if (result.rows.length === 0) {
            return next(new AppError('User not found', 404, 'NOT_FOUND'));
        }

        res.status(200).json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        return next(error);
    }
};

module.exports = {
    login,
    getCurrentUser
};