const { query } = require('../config/db');
const { extractTextFromImage } = require('../services/ocrService');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * TELEGRAM WEBHOOK HANDLER
 * Menerima update dari Telegram Bot (foto laporan)
 */
const handleWebhook = async (req, res) => {
    try {
        const update = req.body;

        console.log('📨 Telegram Webhook received:', JSON.stringify(update, null, 2));

        // Cek apakah ada message
        if (!update.message) {
            return res.status(200).json({ ok: true, message: 'No message' });
        }

        const message = update.message;
        const chatId = message.chat.id;
        const telegramUserId = message.from.id.toString();
        const username = message.from.username || message.from.first_name;

        // Cek apakah ada foto
        if (!message.photo || message.photo.length === 0) {
            await sendTelegramMessage(
                chatId,
                '⚠️ Kirim screenshot GMV untuk membuat laporan!'
            );
            return res.status(200).json({ ok: true });
        }

        // Ambil foto dengan kualitas terbaik (index terakhir)
        const photo = message.photo[message.photo.length - 1];
        const fileId = photo.file_id;

        console.log('📸 Photo received from:', username, '| File ID:', fileId);

        // Kirim notifikasi processing
        await sendTelegramMessage(chatId, '⏳ Memproses screenshot...');

        // Download foto dari Telegram
        const photoPath = await downloadTelegramPhoto(fileId);

        if (!photoPath) {
            await sendTelegramMessage(
                chatId,
                '❌ Gagal mengunduh foto. Coba lagi!'
            );
            return res.status(200).json({ ok: true });
        }

        // Proses OCR
        const ocrResult = await extractTextFromImage(photoPath);

        // Hapus file setelah di-proses
        if (fs.existsSync(photoPath)) {
            fs.unlinkSync(photoPath);
        }

        if (!ocrResult.success || ocrResult.parsedGMV === 0) {
            await sendTelegramMessage(
                chatId,
                '❌ Gagal membaca GMV dari screenshot.\n\n' +
                'Tips:\n' +
                '• Pastikan screenshot jelas\n' +
                '• GMV terlihat dengan jelas\n' +
                '• Coba ambil screenshot ulang'
            );
            return res.status(200).json({ ok: true });
        }

        // Cari atau buat user
        let userResult = await query(
            'SELECT id, role FROM users WHERE telegram_user_id = $1',
            [telegramUserId]
        );

        let userId;
        if (userResult.rows.length === 0) {
            // Auto-register user baru sebagai HOST
            const newUser = await query(
                `INSERT INTO users (telegram_user_id, username, full_name, role)
                 VALUES ($1, $2, $3, 'HOST')
                 RETURNING id`,
                [telegramUserId, username, username]
            );
            userId = newUser.rows[0].id;
            console.log('✅ New HOST registered:', telegramUserId);
        } else {
            userId = userResult.rows[0].id;
        }

        // Simpan laporan ke database
        const reportQuery = `
            INSERT INTO reports (host_id, reported_gmv, screenshot_url, ocr_raw_text, status)
            VALUES ($1, $2, $3, $4, 'PENDING')
            RETURNING id, reported_gmv, created_at
        `;

        const screenshotUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileId}`;

        const reportResult = await query(reportQuery, [
            userId,
            ocrResult.parsedGMV,
            screenshotUrl,
            ocrResult.rawText
        ]);

        const report = reportResult.rows[0];

        // Format GMV ke Rupiah
        const formattedGMV = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(report.reported_gmv);

        // Kirim konfirmasi ke user
        await sendTelegramMessage(
            chatId,
            `✅ *Laporan Berhasil Dibuat!*\n\n` +
            `📊 GMV: ${formattedGMV}\n` +
            `🆔 Report ID: #${report.id}\n` +
            `📅 Waktu: ${new Date(report.created_at).toLocaleString('id-ID')}\n\n` +
            `Status: Menunggu verifikasi manager`,
            { parse_mode: 'Markdown' }
        );

        console.log('✅ Report saved successfully:', report.id);

        res.status(200).json({ ok: true, report_id: report.id });

    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(200).json({ ok: true, error: error.message });
    }
};

/**
 * Download foto dari Telegram
 * @param {String} fileId - Telegram file ID
 * @returns {String} - Path file yang didownload
 */
const downloadTelegramPhoto = async (fileId) => {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        // Get file path dari Telegram
        const fileResponse = await axios.get(
            `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
        );

        if (!fileResponse.data.ok) {
            throw new Error('Failed to get file info from Telegram');
        }

        const filePath = fileResponse.data.result.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

        // Download file
        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });

        // Simpan ke folder temp
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const fileName = `photo_${Date.now()}.jpg`;
        const savePath = path.join(tempDir, fileName);

        fs.writeFileSync(savePath, response.data);

        console.log('✅ Photo downloaded:', savePath);
        return savePath;

    } catch (error) {
        console.error('❌ Download photo error:', error.message);
        return null;
    }
};

/**
 * Kirim pesan ke Telegram
 * @param {Number} chatId - Telegram chat ID
 * @param {String} text - Pesan yang akan dikirim
 * @param {Object} options - Opsi tambahan (parse_mode, dll)
 */
const sendTelegramMessage = async (chatId, text, options = {}) => {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

        await axios.post(url, {
            chat_id: chatId,
            text: text,
            ...options
        });

        console.log('✅ Message sent to chat:', chatId);

    } catch (error) {
        console.error('❌ Send message error:', error.message);
    }
};

/**
 * Setup Telegram Webhook
 * @param {String} webhookUrl - URL webhook publik
 */
const setupWebhook = async (webhookUrl) => {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const url = `https://api.telegram.org/bot${botToken}/setWebhook`;

        const response = await axios.post(url, {
            url: webhookUrl,
            allowed_updates: ['message']
        });

        if (response.data.ok) {
            console.log('✅ Webhook set successfully:', webhookUrl);
            return { success: true, message: 'Webhook configured' };
        } else {
            throw new Error(response.data.description);
        }

    } catch (error) {
        console.error('❌ Setup webhook error:', error.message);
        return { success: false, error: error.message };
    }
};

module.exports = {
    handleWebhook,
    setupWebhook,
    sendTelegramMessage
};