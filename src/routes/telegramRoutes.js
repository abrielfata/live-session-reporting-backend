const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../controllers/telegramController');

/**
 * @route   POST /api/webhook/telegram
 * @desc    Webhook endpoint untuk Telegram Bot
 * @access  Public (akan dipanggil oleh Telegram)
 */
router.post('/telegram', handleWebhook);

/**
 * @route   GET /api/webhook/telegram
 * @desc    Test endpoint
 * @access  Public
 */
router.get('/telegram', (req, res) => {
    res.json({
        success: true,
        message: 'Telegram webhook endpoint is active',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;