const { query } = require('../config/db');

/**
 * GET ALL REPORTS (Manager Only)
 * Mendapatkan semua laporan dengan pagination dan filter
 */
const getAllReports = async (req, res) => {
    try {
        const { 
            status, 
            page = 1, 
            limit = 10, 
            sort = 'created_at', 
            order = 'DESC' 
        } = req.query;

        // Validasi pagination
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // Build WHERE clause
        let whereClause = '';
        const params = [];
        
        if (status) {
            whereClause = 'WHERE r.status = $1';
            params.push(status);
        }

        // Query untuk mendapatkan laporan
        const reportQuery = `
            SELECT 
                r.id,
                r.reported_gmv,
                r.screenshot_url,
                r.ocr_raw_text,
                r.status,
                r.notes,
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
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        params.push(limitNum, offset);

        const reports = await query(reportQuery, params);

        // Query untuk mendapatkan total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM reports r
            ${whereClause}
        `;

        const countParams = status ? [status] : [];
        const countResult = await query(countQuery, countParams);
        const totalReports = parseInt(countResult.rows[0].total);

        // Response
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

        console.log(`✅ Manager retrieved ${reports.rows.length} reports`);

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
 * GET REPORT BY ID (Manager & Host)
 * Host hanya bisa lihat laporan sendiri
 */
const getReportById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        // Query laporan
        const reportQuery = `
            SELECT 
                r.id,
                r.reported_gmv,
                r.screenshot_url,
                r.ocr_raw_text,
                r.status,
                r.notes,
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

        // Jika HOST, cek apakah laporan miliknya
        if (userRole === 'HOST' && report.host_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only view your own reports.'
            });
        }

        res.status(200).json({
            success: true,
            data: report
        });

        console.log(`✅ Report ${id} retrieved by ${userRole}`);

    } catch (error) {
        console.error('❌ Get report by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * GET MY REPORTS (Host Only)
 * Host melihat laporan miliknya sendiri
 */
const getMyReports = async (req, res) => {
    try {
        const userId = req.user.id;
        const { 
            status, 
            page = 1, 
            limit = 10, 
            sort = 'created_at', 
            order = 'DESC' 
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // Build WHERE clause
        let whereClause = 'WHERE r.host_id = $1';
        const params = [userId];
        
        if (status) {
            whereClause += ' AND r.status = $2';
            params.push(status);
        }

        // Query laporan
        const reportQuery = `
            SELECT 
                r.id,
                r.reported_gmv,
                r.screenshot_url,
                r.ocr_raw_text,
                r.status,
                r.notes,
                r.created_at,
                r.updated_at
            FROM reports r
            ${whereClause}
            ORDER BY r.${sort} ${order}
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        params.push(limitNum, offset);

        const reports = await query(reportQuery, params);

        // Total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM reports r
            ${whereClause}
        `;

        const countParams = status ? [userId, status] : [userId];
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

        console.log(`✅ Host retrieved ${reports.rows.length} own reports`);

    } catch (error) {
        console.error('❌ Get my reports error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * UPDATE REPORT STATUS (Manager Only)
 * Verifikasi atau tolak laporan
 */
const updateReportStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        // Validasi status
        const validStatuses = ['VERIFIED', 'REJECTED', 'PENDING'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be VERIFIED, REJECTED, or PENDING'
            });
        }

        // Cek apakah laporan ada
        const checkQuery = 'SELECT id FROM reports WHERE id = $1';
        const checkResult = await query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Report not found'
            });
        }

        // Update status
        const updateQuery = `
            UPDATE reports
            SET status = $1, notes = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING id, status, notes, updated_at
        `;

        const result = await query(updateQuery, [status, notes || null, id]);

        res.status(200).json({
            success: true,
            message: `Report ${status.toLowerCase()} successfully`,
            data: result.rows[0]
        });

        console.log(`✅ Report ${id} status updated to ${status} by Manager`);

    } catch (error) {
        console.error('❌ Update report status error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

/**
 * GET REPORT STATISTICS (Manager Only)
 * Dashboard statistics
 */
const getReportStatistics = async (req, res) => {
    try {
        const statsQuery = `
            SELECT 
                COUNT(*) as total_reports,
                COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_reports,
                COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) as verified_reports,
                COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_reports,
                COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN reported_gmv ELSE 0 END), 0) as total_verified_gmv,
                COALESCE(AVG(CASE WHEN status = 'VERIFIED' THEN reported_gmv END), 0) as avg_verified_gmv
            FROM reports
        `;

        const result = await query(statsQuery);

        res.status(200).json({
            success: true,
            data: result.rows[0]
        });

        console.log('✅ Report statistics retrieved');

    } catch (error) {
        console.error('❌ Get report statistics error:', error);
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
    updateReportStatus,
    getReportStatistics
};