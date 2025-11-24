const express = require('express');
const router = express.Router();
const {
    getAllReports,
    getReportById,
    getMyReports,
    updateReportStatus,
    getReportStatistics
} = require('../controllers/reportController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

/**
 * MANAGER ROUTES
 * Hanya bisa diakses oleh Manager
 */

/**
 * @route   GET /api/reports
 * @desc    Get all reports (with pagination and filter)
 * @access  Private - Manager Only
 * @query   status (optional): PENDING, VERIFIED, REJECTED
 * @query   page (optional, default: 1)
 * @query   limit (optional, default: 10)
 * @query   sort (optional, default: created_at)
 * @query   order (optional, default: DESC)
 */
router.get('/', verifyToken, verifyRole('MANAGER'), getAllReports);

/**
 * @route   GET /api/reports/statistics
 * @desc    Get report statistics for dashboard
 * @access  Private - Manager Only
 */
router.get('/statistics', verifyToken, verifyRole('MANAGER'), getReportStatistics);

/**
 * @route   PUT /api/reports/:id/status
 * @desc    Update report status (verify/reject)
 * @access  Private - Manager Only
 * @body    status: VERIFIED | REJECTED | PENDING
 * @body    notes (optional): Catatan verifikasi
 */
router.put('/:id/status', verifyToken, verifyRole('MANAGER'), updateReportStatus);

/**
 * HOST ROUTES
 * Hanya bisa diakses oleh Host
 */

/**
 * @route   GET /api/reports/my-reports
 * @desc    Get own reports (Host only)
 * @access  Private - Host Only
 * @query   status (optional): PENDING, VERIFIED, REJECTED
 * @query   page (optional, default: 1)
 * @query   limit (optional, default: 10)
 */
router.get('/my-reports', verifyToken, verifyRole('HOST'), getMyReports);

/**
 * SHARED ROUTES
 * Bisa diakses oleh Manager dan Host
 */

/**
 * @route   GET /api/reports/:id
 * @desc    Get report by ID
 * @access  Private - Manager (all reports) | Host (own reports only)
 */
router.get('/:id', verifyToken, getReportById);

module.exports = router;

/**
 * CATATAN PENGGUNAAN:
 * 
 * Tambahkan di server.js:
 * const reportRoutes = require('./routes/reportRoutes');
 * app.use('/api/reports', reportRoutes);
 */