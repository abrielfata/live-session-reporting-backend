const { query } = require('../config/db');
// Tambahkan impor untuk fungsi notifikasi Telegram
const {
    sendReportVerifiedNotification,
    sendReportRejectedNotification
} = require('./telegramController');
const AppError = require('../utils/appError');

/**
 * GET ALL REPORTS (Manager Only)
 * With month/year filter support
 */
const getAllReports = async (req, res) => {
    try {
        const {
            status,
            page = 1,
            limit = 10,
            sort = 'created_at',
            order = 'DESC',
            month, // NEW: Filter by month
            year // NEW: Filter by year
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // Build WHERE clause
        let whereClause = '';
        const params = [];
        let paramIndex = 1;

        if (status) {
            whereClause += `WHERE r.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        // Add month filter
        if (month) {
            whereClause += whereClause ? ' AND' : 'WHERE';
            whereClause += ` r.month = $${paramIndex}`;
            params.push(parseInt(month));
            paramIndex++;
        }

        // Add year filter
        if (year) {
            whereClause += whereClause ? ' AND' : 'WHERE';
            whereClause += ` r.year = $${paramIndex}`;
            params.push(parseInt(year));
            paramIndex++;
        }

        // Query reports
        const reportQuery = `
            SELECT
                r.id,
                r.reported_gmv,
                r.screenshot_url,
                r.ocr_raw_text,
                r.status,
                r.notes,
                r.live_duration,
                r.month,
                r.year,
                r.created_at,
                r.updated_at,
                u.id as host_id,
                u.telegram_user_id,
                u.username as host_username,
                u.full_name as host_full_name
            FROM reports r
            JOIN users u ON r.host_id = u.id
            ${whereClause}
            ORDER BY r.${sort} ${order}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        params.push(limitNum, offset);
        const reports = await query(reportQuery, params);

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM reports r
            ${whereClause}
        `;
        const countParams = params.slice(0, -2); // Remove limit and offset
        const countResult = await query(countQuery, countParams);
        const totalReports = parseInt(countResult.rows[0].total);

        res.status(200).json({
            success: true,
            data: {
                reports: reports.rows,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: totalReports,
                    totalPages: Math.ceil(totalReports / limitNum)
                }
            }
        });

    } catch (error) {
        console.error('❌ Get all reports error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * GET MY REPORTS (Host Only)
 * With month/year filter
 */
const getMyReports = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            status,
            page = 1,
            limit = 10,
            sort = 'created_at',
            order = 'DESC',
            month,
            year
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        let whereClause = 'WHERE r.host_id = $1';
        const params = [userId];
        let paramIndex = 2;

        if (status) {
            whereClause += ` AND r.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (month) {
            whereClause += ` AND r.month = $${paramIndex}`;
            params.push(parseInt(month));
            paramIndex++;
        }

        if (year) {
            whereClause += ` AND r.year = $${paramIndex}`;
            params.push(parseInt(year));
            paramIndex++;
        }

        const reportQuery = `
            SELECT
                r.id,
                r.reported_gmv,
                r.screenshot_url,
                r.ocr_raw_text,
                r.status,
                r.notes,
                r.live_duration,
                r.month,
                r.year,
                r.created_at,
                r.updated_at
            FROM reports r
            ${whereClause}
            ORDER BY r.${sort} ${order}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        params.push(limitNum, offset);
        const reports = await query(reportQuery, params);

        const countQuery = `
            SELECT COUNT(*) as total
            FROM reports r
            ${whereClause}
        `;
        const countParams = params.slice(0, -2);
        const countResult = await query(countQuery, countParams);
        const totalReports = parseInt(countResult.rows[0].total);

        res.status(200).json({
            success: true,
            data: {
                reports: reports.rows,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: totalReports,
                    totalPages: Math.ceil(totalReports / limitNum)
                }
            }
        });

    } catch (error) {
        console.error('❌ Get my reports error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// ============================================
// MODIFIED updateReportStatus FUNCTION
// ============================================

/**
 * UPDATE REPORT STATUS (Manager Only)
 * ✅ NOW SENDS TELEGRAM NOTIFICATION
 */
const updateReportStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        // Validasi status
        const validStatuses = ['VERIFIED', 'REJECTED', 'PENDING'];
        if (!status || !validStatuses.includes(status)) {
            return next(new AppError('Invalid status. Must be VERIFIED, REJECTED, or PENDING', 400, 'VALIDATION_ERROR'));
        }

        // Cek apakah laporan ada DAN ambil data host (untuk notifikasi)
        const checkQuery = `
            SELECT
                r.id,
                r.reported_gmv,
                r.live_duration,
                r.created_at,
                u.telegram_user_id,
                u.full_name as host_name
            FROM reports r
            JOIN users u ON r.host_id = u.id
            WHERE r.id = $1
        `;
        const checkResult = await query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            return next(new AppError('Report not found', 404, 'NOT_FOUND'));
        }

        const reportData = checkResult.rows[0];

        // Update status
        const updateQuery = `
            UPDATE reports
            SET status = $1, notes = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING id, status, notes, updated_at
        `;

        const result = await query(updateQuery, [status, notes || null, id]);

        // ✅ SEND TELEGRAM NOTIFICATION
        if (status === 'VERIFIED') {
            await sendReportVerifiedNotification(
                reportData.telegram_user_id,
                {
                    reportId: reportData.id,
                    gmv: reportData.reported_gmv,
                    duration: reportData.live_duration,
                    createdAt: reportData.created_at,
                    notes: notes || null
                }
            );
        } else if (status === 'REJECTED') {
            await sendReportRejectedNotification(
                reportData.telegram_user_id,
                {
                    reportId: reportData.id,
                    gmv: reportData.reported_gmv,
                    duration: reportData.live_duration,
                    createdAt: reportData.created_at,
                    notes: notes || null
                }
            );
        }

        res.status(200).json({
            success: true,
            message: `Report ${status.toLowerCase()} successfully`,
            data: result.rows[0]
        });

        console.log(`✅ Report ${id} status updated to ${status} by Manager`);
        console.log(`📲 Notification sent to host ${reportData.host_name} (${reportData.telegram_user_id})`);

    } catch (error) {
        return next(error);
    }
};

// ============================================
// END OF MODIFIED FUNCTION
// ============================================

/**
 * GET REPORT STATISTICS (Manager Only)
 * With optional month/year filter
 */
const getReportStatistics = async (req, res) => {
    try {
        const { month, year } = req.query;

        let whereClause = '';
        const params = [];
        let paramIndex = 1;

        if (month) {
            whereClause = `WHERE month = $${paramIndex}`;
            params.push(parseInt(month));
            paramIndex++;
        }

        if (year) {
            whereClause += whereClause ? ' AND' : 'WHERE';
            whereClause += ` year = $${paramIndex}`;
            params.push(parseInt(year));
            paramIndex++;
        }

        const statsQuery = `
            SELECT
                COUNT(*) as total_reports,
                COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_reports,
                COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) as verified_reports,
                COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_reports,
                COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN reported_gmv ELSE 0 END), 0) as total_verified_gmv,
                COALESCE(AVG(CASE WHEN status = 'VERIFIED' THEN reported_gmv END), 0) as avg_verified_gmv
            FROM reports
            ${whereClause}
        `;

        const result = await query(statsQuery, params);

        res.status(200).json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Get report statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * GET MONTHLY HOST STATISTICS (Manager Only)
 * Returns host performance by month
 */
const getMonthlyHostStatistics = async (req, res) => {
    try {
        const { month, year } = req.query;

        let whereClause = '';
        const params = [];
        let paramIndex = 1;

        if (month) {
            whereClause = `WHERE month = $${paramIndex}`;
            params.push(parseInt(month));
            paramIndex++;
        }

        if (year) {
            whereClause += whereClause ? ' AND' : 'WHERE';
            whereClause += ` year = $${paramIndex}`;
            params.push(parseInt(year));
            paramIndex++;
        }

        const hostStatsQuery = `
            SELECT * FROM v_monthly_host_stats
            ${whereClause}
            ORDER BY total_gmv DESC
        `;

        const result = await query(hostStatsQuery, params);

        res.status(200).json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('❌ Get monthly host statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * GET AVAILABLE MONTHS (for dropdown)
 * Returns list of months that have reports
 */
const getAvailableMonths = async (req, res) => {
    try {
        const monthsQuery = `
            SELECT DISTINCT
                year,
                month,
                TO_CHAR(TO_DATE(year || '-' || month || '-01', 'YYYY-MM-DD'), 'Month YYYY') as display_name,
                COUNT(*) as report_count
            FROM reports
            GROUP BY year, month
            ORDER BY year DESC, month DESC
        `;

        const result = await query(monthsQuery);

        res.status(200).json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('❌ Get available months error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Keep existing functions
const getReportById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const reportQuery = `
            SELECT
                r.id,
                r.reported_gmv,
                r.screenshot_url,
                r.ocr_raw_text,
                r.status,
                r.notes,
                r.live_duration,
                r.month,
                r.year,
                r.created_at,
                r.updated_at,
                u.id as host_id,
                u.telegram_user_id,
                u.username as host_username,
                u.full_name as host_full_name
            FROM reports r
            JOIN users u ON r.host_id = u.id
            WHERE r.id = $1
        `;

        const result = await query(reportQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Report not found'
            });
        }

        const report = result.rows[0];

        if (userRole === 'HOST' && report.host_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        res.status(200).json({
            success: true,
            data: report
        });

    } catch (error) {
        console.error('❌ Get report by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

module.exports = {
    getAllReports,
    getReportById,
    getMyReports,
    updateReportStatus, // ✅ Updated function is exported
    getReportStatistics,
    getMonthlyHostStatistics,
    getAvailableMonths
};