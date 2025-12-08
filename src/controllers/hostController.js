const { query } = require('../config/db');
const bcrypt = require('bcryptjs'); // ✅ NEW: For password hashing
const AppError = require('../utils/appError');
// Tambahkan impor untuk fungsi notifikasi Telegram
const {
    sendAccountDeactivatedNotification,
    sendAccountReactivatedNotification
} = require('./telegramController');

/**
 * GET ALL HOSTS (Manager Only)
 * Mendapatkan semua host (approved & pending)
 */
const getAllHosts = async (req, res) => {
    try {
        const { status, is_active } = req.query;

        let whereClause = "WHERE role = 'HOST'";
        const params = [];

        // Filter by approval status
        if (status === 'approved') {
            whereClause += ' AND is_approved = true';
        } else if (status === 'pending') {
            whereClause += ' AND is_approved = false';
        }

        // Filter by active status
        if (is_active !== undefined) {
            whereClause += ` AND is_active = $${params.length + 1}`;
            params.push(is_active === 'true');
        }

        const hostQuery = `
            SELECT
                id,
                telegram_user_id,
                username,
                full_name,
                email,
                role,
                is_active,
                is_approved,
                created_at,
                updated_at
            FROM users
            ${whereClause}
            ORDER BY created_at DESC
        `;

        const result = await query(hostQuery, params);

        // Get report statistics for each host
        const hostsWithStats = await Promise.all(
            result.rows.map(async (host) => {
                const statsQuery = `
                    SELECT
                        COUNT(*) as total_reports,
                        COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) as verified_reports,
                        COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN reported_gmv ELSE 0 END), 0) as total_gmv
                    FROM reports
                    WHERE host_id = $1
                `;
                const stats = await query(statsQuery, [host.id]);

                return {
                    ...host,
                    stats: stats.rows[0]
                };
            })
        );

        res.status(200).json({
            success: true,
            data: hostsWithStats,
            total: hostsWithStats.length
        });

        console.log(`✅ Manager retrieved ${hostsWithStats.length} hosts`);

    } catch (error) {
        console.error('❌ Get all hosts error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * GET HOST BY ID (Manager Only)
 */
const getHostById = async (req, res) => {
    try {
        const { id } = req.params;

        const hostQuery = `
            SELECT
                id,
                telegram_user_id,
                username,
                full_name,
                email,
                role,
                is_active,
                is_approved,
                created_at,
                updated_at
            FROM users
            WHERE id = $1 AND role = 'HOST'
        `;

        const result = await query(hostQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Host not found'
            });
        }

        res.status(200).json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Get host by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * CREATE HOST (Manager Only)
 * Membuat host baru secara manual
 */
const createHost = async (req, res) => {
    try {
        const { telegram_user_id, username, full_name, email, password, is_approved = true } = req.body;

        // Validasi input
        if (!telegram_user_id || !full_name) {
            return next(new AppError('Telegram User ID and Full Name are required', 400, 'VALIDATION_ERROR'));
        }

        // Cek apakah telegram_user_id sudah ada
        const checkQuery = 'SELECT id FROM users WHERE telegram_user_id = $1';
        const checkResult = await query(checkQuery, [telegram_user_id]);

        if (checkResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Telegram User ID already exists'
            });
        }

        // ✅ NEW: Check if email already exists (if provided)
        if (email) {
            const emailCheck = await query(
                'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
                [email]
            );
            if (emailCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already exists'
                });
            }
        }

        // ✅ NEW: Hash password if provided
        let passwordHash = null;
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 6 characters'
                });
            }
            passwordHash = await bcrypt.hash(password, 10);
        }

        // Insert host baru
        const insertQuery = `
            INSERT INTO users (telegram_user_id, username, full_name, email, password_hash, role, is_approved, is_active)
            VALUES ($1, $2, $3, $4, $5, 'HOST', $6, true)
            RETURNING id, telegram_user_id, username, full_name, email, role, is_approved, is_active, created_at
        `;

        const result = await query(insertQuery, [
            telegram_user_id,
            username || `host_${telegram_user_id}`,
            full_name,
            email || null,
            passwordHash,
            is_approved
        ]);

        res.status(201).json({
            success: true,
            message: 'Host created successfully',
            data: result.rows[0]
        });

        console.log(`✅ Host created: ${full_name} by Manager`);

    } catch (error) {
        console.error('❌ Create host error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * UPDATE HOST (Manager Only)
 * ✅ UPDATED: Now supports Email & Password editing
 */
const updateHost = async (req, res) => {
    try {
        const { id } = req.params;
        const { telegram_user_id, username, full_name, email, password, is_active, is_approved } = req.body;

        // Cek apakah host ada
        const checkQuery = "SELECT id, telegram_user_id, email FROM users WHERE id = $1 AND role = 'HOST'";
        const checkResult = await query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            return next(new AppError('Host not found', 404, 'NOT_FOUND'));
        }

        const existingHost = checkResult.rows[0];

        // ✅ NEW: Check if email is being changed and if it's already taken
        if (email && email.toLowerCase() !== existingHost.email?.toLowerCase()) {
            const emailCheck = await query(
                'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2',
                [email, id]
            );
            if (emailCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already exists'
                });
            }
        }

        // Build update query dynamically
        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (telegram_user_id !== undefined) {
            updates.push(`telegram_user_id = $${paramIndex}`);
            params.push(telegram_user_id);
            paramIndex++;
        }
        if (username !== undefined) {
            updates.push(`username = $${paramIndex}`);
            params.push(username);
            paramIndex++;
        }
        if (full_name !== undefined) {
            updates.push(`full_name = $${paramIndex}`);
            params.push(full_name);
            paramIndex++;
        }
        // ✅ NEW: Email update
        if (email !== undefined) {
            updates.push(`email = $${paramIndex}`);
            params.push(email || null);
            paramIndex++;
        }
        // ✅ NEW: Password update (only if provided)
        if (password !== undefined && password.trim() !== '') {
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 6 characters'
                });
            }
            const passwordHash = await bcrypt.hash(password, 10);
            updates.push(`password_hash = $${paramIndex}`);
            params.push(passwordHash);
            paramIndex++;
        }
        if (is_active !== undefined) {
            updates.push(`is_active = $${paramIndex}`);
            params.push(is_active);
            paramIndex++;
        }
        if (is_approved !== undefined) {
            updates.push(`is_approved = $${paramIndex}`);
            params.push(is_approved);
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        const updateQuery = `
            UPDATE users
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING id, telegram_user_id, username, full_name, email, is_active, is_approved, updated_at
        `;

        const result = await query(updateQuery, params);

        res.status(200).json({
            success: true,
            message: 'Host updated successfully',
            data: result.rows[0]
        });

        console.log(`✅ Host ${id} updated by Manager`);
        if (password) {
            console.log(`🔐 Password updated for host ${id}`);
        }
        if (email) {
            console.log(`📧 Email updated for host ${id}: ${email}`);
        }

    } catch (error) {
        console.error('❌ Update host error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * DELETE HOST (Manager Only)
 * Hapus host beserta semua laporannya
 */
const deleteHost = async (req, res) => {
    try {
        const { id } = req.params;

        // Cek apakah host ada
        const checkQuery = "SELECT id, full_name FROM users WHERE id = $1 AND role = 'HOST'";
        const checkResult = await query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            return next(new AppError('Host not found', 404, 'NOT_FOUND'));
        }

        const hostName = checkResult.rows[0].full_name;

        // Delete host (CASCADE akan auto delete reports)
        const deleteQuery = 'DELETE FROM users WHERE id = $1';
        await query(deleteQuery, [id]);

        res.status(200).json({
            success: true,
            message: 'Host deleted successfully',
            data: { id, full_name: hostName }
        });

        console.log(`✅ Host ${hostName} deleted by Manager`);

    } catch (error) {
        console.error('❌ Delete host error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * TOGGLE HOST ACTIVE STATUS (Manager Only)
 * Aktifkan/nonaktifkan host
 * ✅ NOW SENDS TELEGRAM NOTIFICATION
 */
const toggleHostStatus = async (req, res) => {
    try {
        const { id } = req.params;

        // Get current status and telegram_user_id
        const checkQuery = `
            SELECT id, full_name, email, is_active, telegram_user_id
            FROM users
            WHERE id = $1 AND role = 'HOST'
        `;
        const checkResult = await query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            return next(new AppError('Host not found', 404, 'NOT_FOUND'));
        }

        const host = checkResult.rows[0];
        const currentStatus = host.is_active;
        const newStatus = !currentStatus;

        // Update status
        const updateQuery = `
            UPDATE users
            SET is_active = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING id, full_name, is_active
        `;

        const result = await query(updateQuery, [newStatus, id]);

        // ✅ SEND TELEGRAM NOTIFICATION
        if (newStatus) {
            // Account reactivated
            await sendAccountReactivatedNotification(
                host.telegram_user_id,
                host.full_name,
                host.email // ✅ Pass email for notification
            );
        } else {
            // Account deactivated
            await sendAccountDeactivatedNotification(
                host.telegram_user_id,
                host.full_name
            );
        }

        res.status(200).json({
            success: true,
            message: `Host ${newStatus ? 'activated' : 'deactivated'} successfully`,
            data: result.rows[0]
        });

        console.log(`✅ Host ${result.rows[0].full_name} ${newStatus ? 'activated' : 'deactivated'} by Manager`);
        console.log(`📲 Notification sent to Telegram user ${host.telegram_user_id}`);

    } catch (error) {
        console.error('❌ Toggle host status error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};


module.exports = {
    getAllHosts,
    getHostById,
    createHost,
    updateHost,
    deleteHost,
    toggleHostStatus
};