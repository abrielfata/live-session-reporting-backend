const { query } = require('../config/db');
const { extractTextFromImage } = require('../services/ocrService');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ===========================================
// HELPER FUNCTIONS UNTUK ONBOARDING
// ===========================================

/**
 * Handle perintah /start
 */
const handleStartCommand = async (chatId, telegramUserId, username) => {
    // Cari user di database
    const userResult = await query(
        'SELECT id, full_name, role FROM users WHERE telegram_user_id = $1',
        [telegramUserId]
    );

    if (userResult.rows.length === 0) {
        // User baru: Masukkan entry sementara dengan full_name 'PENDING'
        // Kita menggunakan full_name = 'PENDING' sebagai state pendaftaran
        await query(
            `INSERT INTO users (telegram_user_id, username, full_name, role)
             VALUES ($1, $2, 'PENDING', 'HOST')`,
            [telegramUserId, username || `user_${telegramUserId}`]
        );
        
        await sendTelegramMessage(
            chatId,
            `👋 Halo! Selamat datang di Live Session Reporting Bot. \n\nSebelum melanjutkan, **siapa nama lengkap Anda?** (Contoh: Budi Santoso)`
        );
        console.log('✅ New user started registration:', telegramUserId);
    } else if (userResult.rows[0].full_name === 'PENDING') {
        // User sudah memulai tapi belum memasukkan nama
        await sendTelegramMessage(
            chatId,
            `Mohon masukkan nama lengkap Anda untuk menyelesaikan pendaftaran.`
        );
    } 
    else {
        // User lama: Beri salam biasa
        await sendTelegramMessage(
            chatId,
            `Selamat datang kembali, **${userResult.rows[0].full_name}** (${userResult.rows[0].role}). \n\nSilakan kirimkan screenshot laporan GMV Anda.`
        );
    }
};

/**
 * Handle input teks biasa (dianggap sebagai nama jika status PENDING)
 */
const handleTextInput = async (chatId, telegramUserId, username, textInput) => {
    // Cari user dengan status PENDING
    const userResult = await query(
        "SELECT id FROM users WHERE telegram_user_id = $1 AND full_name = 'PENDING'",
        [telegramUserId]
    );

    if (userResult.rows.length > 0) {
        // User sedang dalam mode pendaftaran, update namanya
        await query(
            `UPDATE users 
             SET full_name = $1, username = $2, updated_at = CURRENT_TIMESTAMP
             WHERE telegram_user_id = $3`,
            [textInput, username || `user_${telegramUserId}`, telegramUserId]
        );
        
        await sendTelegramMessage(
            chatId,
            `Terima kasih, **${textInput}**. Pendaftaran Anda selesai. Anda sekarang dapat mengirimkan screenshot laporan GMV Anda.`
        );
        console.log('✅ User registration completed for:', textInput);
    } else {
        // Jika teks bukan input nama dan bukan command
        await sendTelegramMessage(
            chatId,
            'Mohon kirimkan **screenshot laporan GMV** atau ketik `/start` untuk memulai.'
        );
    }
};

// ===========================================
// MAIN PROCESSING LOGIC
// ===========================================

/**
 * Logika utama pemrosesan foto laporan GMV.
 */
const processPhotoReport = async (message, chatId, telegramUserId, username) => {
    // 1. Cek User Status sebelum memproses laporan
    const userResult = await query(
        'SELECT id, full_name FROM users WHERE telegram_user_id = $1',
        [telegramUserId]
    );

    if (userResult.rows.length === 0 || userResult.rows[0].full_name === 'PENDING') {
        // Jika user belum terdaftar atau sedang dalam mode pendaftaran nama
        await sendTelegramMessage(
            chatId,
            '❌ Akses Ditolak. Mohon ketik `/start` terlebih dahulu dan masukkan nama Anda untuk menyelesaikan pendaftaran.'
        );
        return;
    }
    
    // User sudah terdaftar dan siap
    const userId = userResult.rows[0].id;
    
    // Ambil foto dengan kualitas terbaik (index terakhir)
    const photo = message.photo[message.photo.length - 1];
    const fileId = photo.file_id;

    console.log('📸 Photo received from:', username, '| File ID:', fileId);

    // Kirim notifikasi processing (karena webhook sudah diakui)
    await sendTelegramMessage(chatId, '⏳ Memproses screenshot...');

    // Download foto dari Telegram
    const photoPath = await downloadTelegramPhoto(fileId);

    if (!photoPath) {
        await sendTelegramMessage(
            chatId,
            '❌ Gagal mengunduh foto. Coba lagi!'
        );
        return;
    }

    // Proses OCR (Lama/Heavy lifting)
    const ocrResult = await extractTextFromImage(photoPath);

    // Hapus file setelah di-proses
    if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
    }

    if (!ocrResult.success) {
        await sendTelegramMessage(
            chatId,
            '❌ Gagal membaca teks dari screenshot. Pastikan screenshot jelas. Coba ambil ulang.'
        );
        return;
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
}


/**
 * Fungsi baru untuk menjalankan semua logika pemrosesan yang lama (Async processing).
 */
const processTelegramUpdate = async (update) => {
    // Pastikan ada pesan
    if (!update.message) {
        return;
    }

    const message = update.message;
    const chatId = message.chat.id;
    const telegramUserId = message.from.id.toString();
    const username = message.from.username || message.from.first_name;

    try {
        // Cek jika pesan adalah TEXT
        if (message.text) {
            const text = message.text.trim();
            
            // 1. Handle COMMAND /start
            if (text === '/start') {
                await handleStartCommand(chatId, telegramUserId, username);
                return; 
            }
            
            // 2. Handle TEXT INPUT (dianggap nama jika status PENDING)
            await handleTextInput(chatId, telegramUserId, username, text);
            return;
        }

        // Cek jika pesan adalah PHOTO
        if (message.photo && message.photo.length > 0) {
            await processPhotoReport(message, chatId, telegramUserId, username);
            return;
        }
        
        // Cek jika pesan tidak berupa foto atau teks
        await sendTelegramMessage(
            chatId,
            'Mohon kirimkan **screenshot laporan GMV** atau ketik `/start` untuk memulai.'
        );


    } catch (error) {
        // Tangani error di sini, kirim notifikasi error ke user via Telegram
        console.error('❌ Async Webhook Processing error:', error);
        
        // Kirim pesan ke user bahwa terjadi error
        await sendTelegramMessage(
            chatId,
            '❌ Terjadi kesalahan saat memproses laporan Anda. Silakan coba lagi.'
        );
    }
};

/**
 * TELEGRAM WEBHOOK HANDLER
 * Menerima update dari Telegram Bot (foto laporan)
 */
const handleWebhook = async (req, res) => {
    // 1. TANGGAPI TELEGRAM SEGERA (IMMEDIATE ACKNOWLEDGEMENT)
    // Ini menyelesaikan masalah "Waiting to receive a response"
    res.status(200).json({ ok: true, message: 'Processing started asynchronously' });

    try {
        const update = req.body;

        // Lanjutkan pemrosesan yang berat secara asinkron
        if (update.message) {
            // Panggil fungsi pemrosesan tanpa 'await'
            processTelegramUpdate(update);
        } else {
            // console.log('📨 Telegram Webhook received (no message to process):', JSON.stringify(update, null, 2));
        }

    } catch (error) {
        // Karena respons HTTP 200 sudah dikirim di awal, 
        // kita hanya perlu logging error ini.
        console.error('❌ Webhook (initial handling) error:', error);
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