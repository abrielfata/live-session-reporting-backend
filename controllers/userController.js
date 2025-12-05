const { query } = require('../config/db');
const { 
    sendAccountApprovedNotification, 
    sendAccountRejectedNotification 
} = require('./telegramController');

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
 * ✅ NOW SENDS TELEGRAM NOTIFICATION
 */
const approveUser = async (req, res) => {
    try {
        const { userId } = req.params;

        // Cek apakah user ada
        const checkQuery = 'SELECT id, telegram_user_id, full_name FROM users WHERE id = $1';
        const checkResult = await query(checkQuery, [userId]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = checkResult.rows[0];

        // Update is_approved menjadi true
        const updateQuery = `
            UPDATE users
            SET is_approved = true, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING id, telegram_user_id, username, full_name, is_approved
        `;

        const result = await query(updateQuery, [userId]);

        // ✅ SEND TELEGRAM NOTIFICATION
        await sendAccountApprovedNotification(
            user.telegram_user_id, 
            user.full_name
        );

        res.status(200).json({
            success: true,
            message: 'User approved successfully',
            data: result.rows[0]
        });

        console.log(`✅ User ${result.rows[0].full_name} approved by Manager`);
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
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
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
        console.error('❌ Reject user error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

module.exports = {
    getPendingUsers,
    approveUser,
    rejectUser
};