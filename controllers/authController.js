const { query } = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

/**
 * LOGIN CONTROLLER - EMAIL & PASSWORD
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Validasi input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and Password are required'
            });
        }

        // 2. Validasi format email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
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
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const user = result.rows[0];

        // 4. Cek password hash
        if (!user.password_hash) {
            return res.status(401).json({
                success: false,
                message: 'Please set your password first'
            });
        }

        // 5. Verifikasi password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // 6. Cek approval
        if (!user.is_approved) {
            return res.status(403).json({
                success: false,
                message: 'Your account is pending approval'
            });
        }

        // 7. Cek status aktif
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated'
            });
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
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
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
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Get current user error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

module.exports = {
    login,
    getCurrentUser
};