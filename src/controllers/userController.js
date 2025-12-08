const { query } = require('../config/db');
const { 
    sendAccountApprovedNotification, 
    sendAccountRejectedNotification 
} = require('./telegramController');
const AppError = require('../utils/appError');

/**
 * GET ALL PENDING USERS (Manager Only)
 */
const getPendingUsers = async (req, res) => {
    try {
        const userQuery = `
            SELECT 
                id,
                telegram_user_id,
                username,
                full_name,
                email,
                role,
                is_approved,
                created_at
            FROM users
            WHERE is_approved = false AND full_name != 'PENDING'
            ORDER BY created_at DESC
        `;
        
        const result = await query(userQuery);

        res.status(200).json({
            success: true,
            data: result.rows,
            total: result.rows.length
        });

        console.log(`✅ Manager retrieved ${result.rows.length} pending users`);

    } catch (error) {
        console.error('❌ Get pending users error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * APPROVE USER (Manager Only)
 * ✅ FIXED: Now sets is_active = true when approving
 */
const approveUser = async (req, res) => {
    try {
        const { userId } = req.params;

        // Cek apakah user ada
        const checkQuery = 'SELECT id, telegram_user_id, full_name, email FROM users WHERE id = $1';
        const checkResult = await query(checkQuery, [userId]);

        if (checkResult.rows.length === 0) {
            return next(new AppError('User not found', 404, 'NOT_FOUND'));
        }

        const user = checkResult.rows[0];

        // ✅ FIXED: Update both is_approved AND is_active to true
        const updateQuery = `
            UPDATE users
            SET 
                is_approved = true, 
                is_active = true,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING id, telegram_user_id, username, full_name, email, is_approved, is_active
        `;

        const result = await query(updateQuery, [userId]);

        // ✅ SEND TELEGRAM NOTIFICATION with email
        await sendAccountApprovedNotification(
            user.telegram_user_id, 
            user.full_name,
            user.email // Pass email for notification
        );

        res.status(200).json({
            success: true,
            message: 'User approved successfully',
            data: result.rows[0]
        });

        console.log(`✅ User ${result.rows[0].full_name} approved by Manager`);
        console.log(`✅ Account status set to ACTIVE`);
        console.log(`📲 Notification sent to Telegram user ${user.telegram_user_id}`);

    } catch (error) {
        console.error('❌ Approve user error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * REJECT/DELETE USER (Manager Only)
 * ✅ NOW SENDS TELEGRAM NOTIFICATION
 */
const rejectUser = async (req, res) => {
    try {
        const { userId } = req.params;

        // Cek apakah user ada
        const checkQuery = 'SELECT id, telegram_user_id, full_name FROM users WHERE id = $1';
        const checkResult = await query(checkQuery, [userId]);

        if (checkResult.rows.length === 0) {
            return next(new AppError('User not found', 404, 'NOT_FOUND'));
        }

        const user = checkResult.rows[0];

        // ✅ SEND TELEGRAM NOTIFICATION BEFORE DELETING
        await sendAccountRejectedNotification(
            user.telegram_user_id, 
            user.full_name
        );

        // Hapus user
        const deleteQuery = 'DELETE FROM users WHERE id = $1 RETURNING full_name';
        const result = await query(deleteQuery, [userId]);

        res.status(200).json({
            success: true,
            message: 'User rejected and deleted successfully',
            data: { full_name: result.rows[0].full_name }
        });

        console.log(`✅ User ${result.rows[0].full_name} rejected and deleted by Manager`);
        console.log(`📲 Rejection notification sent to Telegram user ${user.telegram_user_id}`);

    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getPendingUsers,
    approveUser,
    rejectUser
};