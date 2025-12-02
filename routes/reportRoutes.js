const express = require('express');
const router = express.Router();
const {
    getAllReports,
    getReportById,
    getMyReports,
    updateReportStatus,
    getReportStatistics,
    getMonthlyHostStatistics,    // NEW
    getAvailableMonths            // NEW
} = require('../controllers/reportController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

/**
 * MANAGER ROUTES
 */

/**
 * @route   GET /api/reports
 * @desc    Get all reports (with pagination, filter, month/year)
 * @access  Private - Manager Only
 * @query   status, page, limit, sort, order, month, year
 */
router.get('/', verifyToken, verifyRole('MANAGER'), getAllReports);

/**
 * @route   GET /api/reports/statistics
 * @desc    Get report statistics (with optional month/year filter)
 * @access  Private - Manager Only
 * @query   month, year
 */
router.get('/statistics', verifyToken, verifyRole('MANAGER'), getReportStatistics);

/**
 * @route   GET /api/reports/monthly-host-stats
 * @desc    Get monthly statistics per host
 * @access  Private - Manager Only
 * @query   month, year
 */
router.get('/monthly-host-stats', verifyToken, verifyRole('MANAGER'), getMonthlyHostStatistics);

/**
 * @route   GET /api/reports/available-months
 * @desc    Get list of months that have reports
 * @access  Private - Manager Only
 */
router.get('/available-months', verifyToken, verifyRole('MANAGER'), getAvailableMonths);

/**
 * @route   PUT /api/reports/:id/status
 * @desc    Update report status (verify/reject)
 * @access  Private - Manager Only
 */
router.put('/:id/status', verifyToken, verifyRole('MANAGER'), updateReportStatus);

/**
 * HOST ROUTES
 */

/**
 * @route   GET /api/reports/my-reports
 * @desc    Get own reports (with month/year filter)
 * @access  Private - Host Only
 * @query   status, page, limit, month, year
 */
router.get('/my-reports', verifyToken, verifyRole('HOST'), getMyReports);

/**
 * SHARED ROUTES
 */

/**
 * @route   GET /api/reports/:id
 * @desc    Get report by ID
 * @access  Private - Manager (all) | Host (own only)
 */
router.get('/:id', verifyToken, getReportById);

module.exports = router;