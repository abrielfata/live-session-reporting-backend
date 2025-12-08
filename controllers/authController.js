const { query } = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

/**
 * LOGIN CONTROLLER
 * Autentikasi user dengan Telegram ID dan Password
 * Fitur: Validasi Password, Cek Approval, Cek Status Aktif
 */
const login = async (req, res) => {
    try {
        const { telegram_user_id, password } = req.body;

        // 1. Validasi input dasar
        if (!telegram_user_id || !password) {
            return res.status(400).json({
                success: false,
                message: 'Telegram User ID and Password are required'
            });
        }

        // 2. Cari user di database
        // Kita perlu mengambil password_hash, is_approved, dan is_active untuk validasi
        const userQuery = `
            SELECT id, telegram_user_id, username, full_name, role, is_active, is_approved, password_hash
            FROM users
            WHERE telegram_user_id = $1
        `;
        
        const result = await query(userQuery, [telegram_user_id]);

        // 3. Jika user tidak ditemukan
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid Telegram User ID or Password'
            });
        }

        const user = result.rows[0];

        // 4. Cek apakah user sudah mengatur password (via Bot)
        if (!user.password_hash) {
            return res.status(401).json({
                success: false,
                message: 'Please set your password via Telegram Bot first (/setpassword)'
            });
        }

        // 5. Verifikasi Password dengan Bcrypt
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid Telegram User ID or Password'
            });
        }

        // 6. Cek Approval (Persetujuan Manager)
        if (!user.is_approved) {
            return res.status(403).json({
                success: false,
                message: 'Your account is pending approval from Manager'
            });
        }

        // 7. Cek Status Aktif (Banned/Inactive)
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated'
            });
        }

        // 8. Generate JWT Token
        const token = jwt.sign(
            {
                id: user.id,
                telegram_user_id: user.telegram_user_id,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // Token berlaku 7 hari
        );

        // 9. Response Sukses
        console.log(`✅ User logged in: ${user.username || user.telegram_user_id} (${user.role})`);
        
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
 * Mendapatkan info user yang sedang login berdasarkan Token JWT
 */
const getCurrentUser = async (req, res) => {
    try {
        // req.user.id didapat dari middleware auth (verifyToken)
        const userQuery = `
            SELECT id, telegram_user_id, username, full_name, role, created_at, is_active, is_approved
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