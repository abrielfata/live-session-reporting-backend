const express = require('express');
const router = express.Router();
const {
    getAllHosts,
    getHostById,
    createHost,
    updateHost,
    deleteHost,
    toggleHostStatus
} = require('../controllers/hostController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

/**
 * ALL ROUTES BELOW ARE MANAGER ONLY
 */

/**
 * @route   GET /api/hosts
 * @desc    Get all hosts with statistics
 * @access  Private - Manager Only
 * @query   status (optional): approved, pending
 * @query   is_active (optional): true, false
 */
router.get('/', verifyToken, verifyRole('MANAGER'), getAllHosts);

/**
 * @route   GET /api/hosts/:id
 * @desc    Get host by ID
 * @access  Private - Manager Only
 */
router.get('/:id', verifyToken, verifyRole('MANAGER'), getHostById);

/**
 * @route   POST /api/hosts
 * @desc    Create new host
 * @access  Private - Manager Only
 * @body    telegram_user_id, username, full_name, is_approved (optional)
 */
router.post('/', verifyToken, verifyRole('MANAGER'), createHost);

/**
 * @route   PUT /api/hosts/:id
 * @desc    Update host
 * @access  Private - Manager Only
 * @body    telegram_user_id, username, full_name, is_active, is_approved
 */
router.put('/:id', verifyToken, verifyRole('MANAGER'), updateHost);

/**
 * @route   DELETE /api/hosts/:id
 * @desc    Delete host (and all reports)
 * @access  Private - Manager Only
 */
router.delete('/:id', verifyToken, verifyRole('MANAGER'), deleteHost);

/**
 * @route   PATCH /api/hosts/:id/toggle-status
 * @desc    Toggle host active status
 * @access  Private - Manager Only
 */
router.patch('/:id/toggle-status', verifyToken, verifyRole('MANAGER'), toggleHostStatus);

module.exports = router;