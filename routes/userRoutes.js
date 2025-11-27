const express = require('express');
const router = express.Router();
const {
    getPendingUsers,
    approveUser,
    rejectUser
} = require('../controllers/userController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

/**
 * @route   GET /api/users/pending
 * @desc    Get all pending users (waiting for approval)
 * @access  Private - Manager Only
 */
router.get('/pending', verifyToken, verifyRole('MANAGER'), getPendingUsers);

/**
 * @route   PUT /api/users/:userId/approve
 * @desc    Approve user registration
 * @access  Private - Manager Only
 */
router.put('/:userId/approve', verifyToken, verifyRole('MANAGER'), approveUser);

/**
 * @route   DELETE /api/users/:userId/reject
 * @desc    Reject and delete user
 * @access  Private - Manager Only
 */
router.delete('/:userId/reject', verifyToken, verifyRole('MANAGER'), rejectUser);

module.exports = router;