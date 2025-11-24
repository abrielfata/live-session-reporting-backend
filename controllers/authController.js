const { query } = require('../config/db');
const jwt = require('jsonwebtoken');

/**
 * LOGIN CONTROLLER
 * Autentikasi user dan generate JWT token
 */
const login = async (req, res) => {
    try {
        const { telegram_user_id, username } = req.body;

        // Validasi input
        if (!telegram_user_id) {
            return res.status(400).json({
                success: false,
                message: 'Telegram User ID is required'
            });
        }

        // Cari user di database berdasarkan telegram_user_id
        const userQuery = `
            SELECT id, telegram_user_id, username, full_name, role, is_active
            FROM users
            WHERE telegram_user_id = $1
        `;
        
        const result = await query(userQuery, [telegram_user_id]);

        // Jika user tidak ditemukan, buat user baru (auto-register)
        let user;
        if (result.rows.length === 0) {
            const insertQuery = `
                INSERT INTO users (telegram_user_id, username, full_name, role)
                VALUES ($1, $2, $3, $4)
                RETURNING id, telegram_user_id, username, full_name, role, is_active
            `;
            
            const newUser = await query(insertQuery, [
                telegram_user_id,
                username || `user_${telegram_user_id}`,
                username || 'New User',
                'HOST' // Default role untuk user baru
            ]);
            
            user = newUser.rows[0];
            console.log('✅ New user registered:', user.telegram_user_id);
        } else {
            user = result.rows[0];
        }

        // Cek apakah user aktif
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'User account is inactive'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                telegram_user_id: user.telegram_user_id,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // Token berlaku 7 hari
        );

        // Response sukses
        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user.id,
                    telegram_user_id: user.telegram_user_id,
                    username: user.username,
                    full_name: user.full_name,
                    role: user.role
                }
            }
        });

        console.log(`✅ User logged in: ${user.username} (${user.role})`);

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
 * Mendapatkan info user yang sedang login
 */
const getCurrentUser = async (req, res) => {
    try {
        // Data user sudah ada di req.user (dari middleware)
        const userQuery = `
            SELECT id, telegram_user_id, username, full_name, role, created_at
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