const express = require('express');
const router = express.Router();
const { login, getCurrentUser } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * @route   POST /api/auth/login
 * @desc    Login user dan generate JWT token
 * @access  Public
 */
router.post('/login', login);

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged in user
 * @access  Private (butuh token)
 */
router.get('/me', verifyToken, getCurrentUser);

module.exports = router;