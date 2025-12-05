const { query } = require('../config/db');
const { extractTextFromImage } = require('../services/ocrService');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============================================
// STATE MANAGEMENT
// ============================================
const userStates = new Map();

const setState = (userId, state, data = {}) => {
    userStates.set(userId, { 
        state, 
        data, 
        timestamp: Date.now() 
    });
    console.log(`📝 State set for user ${userId}: ${state}`);
};

const getState = (userId) => {
    const userState = userStates.get(userId);
    if (userState && Date.now() - userState.timestamp > 600000) {
        console.log(`⏰ State expired for user ${userId}`);
        userStates.delete(userId);
        return null;
    }
    return userState;
};

const clearState = (userId) => {
    userStates.delete(userId);
    console.log(`🗑️ State cleared for user ${userId}`);
};

// ============================================
// HELPER FUNCTIONS UNTUK ONBOARDING
// ============================================

const handleStartCommand = async (chatId, telegramUserId, username) => {
    clearState(telegramUserId);
    
    const userResult = await query(
        'SELECT id, full_name, role, is_approved FROM users WHERE telegram_user_id = $1',
        [telegramUserId]
    );

    if (userResult.rows.length === 0) {
        await query(
            `INSERT INTO users (telegram_user_id, username, full_name, role)
             VALUES ($1, $2, 'PENDING', 'HOST')`,
            [telegramUserId, username || `user_${telegramUserId}`]
        );
        
        setState(telegramUserId, 'WAITING_FULL_NAME');
        
        await sendTelegramMessage(
            chatId,
            `👋 Halo! Selamat datang di Live Session Reporting Bot.\n\n` +
            `Sebelum melanjutkan, **siapa nama lengkap Anda?**\n\n` +
            `Contoh: Budi Santoso`,
            { parse_mode: 'Markdown' }
        );
        console.log('✅ New user started registration:', telegramUserId);
    } else if (userResult.rows[0].full_name === 'PENDING') {
        setState(telegramUserId, 'WAITING_FULL_NAME');
        await sendTelegramMessage(
            chatId,
            `Mohon masukkan nama lengkap Anda untuk menyelesaikan pendaftaran.`
        );
    } else if (!userResult.rows[0].is_approved) {
        await sendTelegramMessage(
            chatId,
            `⏳ *Akun Anda Belum Disetujui*\n\n` +
            `Halo **${userResult.rows[0].full_name}**!\n\n` +
            `Pendaftaran Anda sedang menunggu persetujuan dari Manager.\n` +
            `Anda akan mendapat notifikasi setelah akun Anda diaktifkan.`,
            { parse_mode: 'Markdown' }
        );
    } else {
        await sendTelegramMessage(
            chatId,
            `Selamat datang kembali, **${userResult.rows[0].full_name}** (${userResult.rows[0].role})!\n\n` +
            `Silakan kirimkan screenshot laporan GMV Anda.`,
            { parse_mode: 'Markdown' }
        );
    }
};

const handleFullNameInput = async (chatId, telegramUserId, username, fullName) => {
    await query(
        `UPDATE users 
         SET full_name = $1, username = $2, updated_at = CURRENT_TIMESTAMP
         WHERE telegram_user_id = $3`,
        [fullName, username || `user_${telegramUserId}`, telegramUserId]
    );
    
    clearState(telegramUserId);
    
    await sendTelegramMessage(
        chatId,
        `Terima kasih, **${fullName}**!\n\n` +
        `✅ Pendaftaran Anda selesai.\n` +
        `⏳ Menunggu persetujuan Manager.\n\n` +
        `Anda akan mendapat notifikasi setelah akun diaktifkan.`,
        { parse_mode: 'Markdown' }
    );
    console.log('✅ User registration completed for:', fullName);
};

// ============================================
// PHOTO PROCESSING WITH CONFIRMATION
// ============================================

const processPhotoReport = async (message, chatId, telegramUserId, username) => {
    console.log('\n📸 ========== PHOTO PROCESSING START ==========');
    
    const previousState = getState(telegramUserId);
    if (previousState && previousState.state === 'WAITING_CONFIRMATION') {
        console.log('🔄 Overriding previous confirmation with new photo');
        clearState(telegramUserId);
    }
    
    const userResult = await query(
        'SELECT id, full_name, is_approved FROM users WHERE telegram_user_id = $1',
        [telegramUserId]
    );

    if (userResult.rows.length === 0 || userResult.rows[0].full_name === 'PENDING') {
        await sendTelegramMessage(
            chatId,
            '❌ Akses Ditolak. Mohon ketik /start terlebih dahulu.'
        );
        return;
    }

    if (!userResult.rows[0].is_approved) {
        await sendTelegramMessage(
            chatId,
            '⏳ *Akun Anda Belum Disetujui*\n\n' +
            'Pendaftaran Anda sedang menunggu persetujuan dari Manager.\n' +
            'Anda akan mendapat notifikasi setelah akun Anda diaktifkan.\n\n' +
            '👤 Nama: ' + userResult.rows[0].full_name,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const userId = userResult.rows[0].id;
    const photo = message.photo[message.photo.length - 1];
    const fileId = photo.file_id;

    console.log('👤 User:', username);
    console.log('📎 File ID:', fileId);

    await sendTelegramMessage(chatId, '⏳ Memproses screenshot...');

    const photoPath = await downloadTelegramPhoto(fileId);

    if (!photoPath) {
        await sendTelegramMessage(
            chatId,
            '❌ Gagal mengunduh foto. Coba lagi!'
        );
        return;
    }

    console.log('🔍 Starting OCR process...');
    const ocrResult = await extractTextFromImage(photoPath);

    if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
        console.log('🗑️ Temp file deleted');
    }

    if (!ocrResult.success) {
        console.error('❌ OCR failed:', ocrResult.error);
        await sendTelegramMessage(
            chatId,
            '❌ Gagal membaca teks dari screenshot.\n\n' +
            `Error: ${ocrResult.error}\n\n` +
            'Pastikan screenshot jelas dan coba ambil ulang.',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    console.log('✅ OCR Success!');
    console.log('💰 Parsed GMV:', ocrResult.parsedGMV);
    console.log('⏱️ Parsed Duration:', ocrResult.parsedDuration);

    const formattedGMV = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(ocrResult.parsedGMV);

    const screenshotUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileId}`;
    
    setState(telegramUserId, 'WAITING_CONFIRMATION', {
        userId: userId,
        gmv: ocrResult.parsedGMV,
        screenshotUrl: screenshotUrl,
        ocrRawText: ocrResult.rawText,
        duration: ocrResult.parsedDuration 
    });

    await sendTelegramMessage(
        chatId,
        `✅ *Screenshot Berhasil Diproses!*\n\n` +
        `📊 GMV Terdeteksi: ${formattedGMV}\n` +
        `⏱️ Durasi LIVE: ${ocrResult.parsedDuration || 'Tidak terdeteksi'}\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `Apakah data ini sudah benar?\n\n` +
        `• Ketik *Y* atau *Ya* untuk Simpan ✅\n` +
        `• Ketik *N* atau *Tidak* untuk Batal ❌\n` +
        `• Kirim foto baru untuk scan ulang 📸`,
        { parse_mode: 'Markdown' }
    );

    console.log('✅ Waiting for user confirmation');
    console.log('========== PHOTO PROCESSING END ==========\n');
};

const handleConfirmation = async (chatId, telegramUserId, textInput) => {
    const currentState = getState(telegramUserId);

    if (!currentState || currentState.state !== 'WAITING_CONFIRMATION') {
        return false;
    }

    const response = textInput.trim().toUpperCase();

    if (response === 'Y' || response === 'YA' || response === 'YES') {
        console.log('✅ User confirmed: YES');
        const { userId, gmv, screenshotUrl, ocrRawText, duration } = currentState.data;

        try {
            const reportQuery = `
                INSERT INTO reports (host_id, reported_gmv, screenshot_url, ocr_raw_text, status, live_duration)
                VALUES ($1, $2, $3, $4, 'PENDING', $5)
                RETURNING id, reported_gmv, live_duration, created_at
            `;

            const reportResult = await query(reportQuery, [
                userId,
                gmv,
                screenshotUrl,
                ocrRawText,
                duration || null
            ]);

            const report = reportResult.rows[0];

            const formattedGMV = new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0
            }).format(report.reported_gmv);

            clearState(telegramUserId);

            await sendTelegramMessage(
                chatId,
                `✅ *Laporan Berhasil Disimpan!*\n\n` +
                `📊 GMV: ${formattedGMV}\n` +
                `⏱️ Durasi: ${report.live_duration || 'Tidak terdeteksi'}\n` +
                `🆔 Report ID: #${report.id}\n` +
                `📅 Waktu: ${new Date(report.created_at).toLocaleString('id-ID')}\n\n` +
                `Status: Menunggu verifikasi manager`,
                { parse_mode: 'Markdown' }
            );

            console.log('✅ Report saved successfully:', report.id);

        } catch (error) {
            console.error('❌ Save report error:', error);
            await sendTelegramMessage(
                chatId,
                '❌ Terjadi kesalahan saat menyimpan laporan. Silakan coba lagi.'
            );
            clearState(telegramUserId);
        }

        return true;
    }
    else if (response === 'N' || response === 'NO' || response === 'TIDAK' || response === 'CANCEL') {
        console.log('❌ User confirmed: NO');
        clearState(telegramUserId);
        
        await sendTelegramMessage(
            chatId,
            `❌ *Laporan Dibatalkan*\n\n` +
            `Silakan kirim screenshot GMV yang baru.`,
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    await sendTelegramMessage(
        chatId,
        `⚠️ *Konfirmasi Tidak Valid*\n\n` +
        `Silakan ketik:\n` +
        `• *Y* atau *Ya* untuk Simpan ✅\n` +
        `• *N* atau *Tidak* untuk Batal ❌`,
        { parse_mode: 'Markdown' }
    );

    return true;
};

const handleTextInput = async (chatId, telegramUserId, username, textInput) => {
    console.log('💬 Text input received:', textInput);
    
    const confirmed = await handleConfirmation(chatId, telegramUserId, textInput);
    if (confirmed) {
        return;
    }

    const currentState = getState(telegramUserId);
    if (currentState && currentState.state === 'WAITING_FULL_NAME') {
        await handleFullNameInput(chatId, telegramUserId, username, textInput);
        return;
    }

    await sendTelegramMessage(
        chatId,
        'Mohon kirimkan *screenshot laporan GMV* atau ketik /start untuk memulai.',
        { parse_mode: 'Markdown' }
    );
};

// ============================================
// MAIN PROCESSING LOGIC
// ============================================

const processTelegramUpdate = async (update) => {
    if (!update.message) {
        return;
    }

    const message = update.message;
    const chatId = message.chat.id;
    const telegramUserId = message.from.id.toString();
    const username = message.from.username || message.from.first_name;

    try {
        if (message.text) {
            const text = message.text.trim();
            
            if (text === '/start') {
                await handleStartCommand(chatId, telegramUserId, username);
                return; 
            }
            
            await handleTextInput(chatId, telegramUserId, username, text);
            return;
        }

        if (message.photo && message.photo.length > 0) {
            await processPhotoReport(message, chatId, telegramUserId, username);
            return;
        }
        
        await sendTelegramMessage(
            chatId,
            'Mohon kirimkan *screenshot laporan GMV* atau ketik /start untuk memulai.',
            { parse_mode: 'Markdown' }
        );

    } catch (error) {
        console.error('❌ Async Webhook Processing error:', error);
        await sendTelegramMessage(
            chatId,
            '❌ Terjadi kesalahan saat memproses laporan Anda. Silakan coba lagi.'
        );
    }
};

const handleWebhook = async (req, res) => {
    res.status(200).json({ ok: true, message: 'Processing started asynchronously' });

    try {
        const update = req.body;
        if (update.message) {
            processTelegramUpdate(update);
        }
    } catch (error) {
        console.error('❌ Webhook (initial handling) error:', error);
    }
};

// ============================================
// NOTIFICATION FUNCTIONS (NEW)
// ============================================

/**
 * Send notification when HOST account is APPROVED
 */
const sendAccountApprovedNotification = async (telegramUserId, fullName) => {
    try {
        const message = `
🎉 *Akun Anda Telah Diaktifkan!*

Halo *${fullName}*! 

✅ Selamat! Akun Anda telah disetujui oleh Manager.

Anda sekarang dapat mulai mengirim laporan GMV LIVE session Anda.

📸 *Cara Menggunakan:*
1. Kirim screenshot hasil LIVE Anda
2. Bot akan otomatis memproses GMV dan durasi
3. Konfirmasi data dengan ketik *Y* atau *Ya*
4. Laporan tersimpan dan menunggu verifikasi manager

Selamat bekerja! 🚀
        `;

        await sendTelegramMessage(telegramUserId, message, { parse_mode: 'Markdown' });
        console.log(`✅ Notification sent to ${fullName} (${telegramUserId})`);
    } catch (error) {
        console.error('❌ Send approval notification error:', error.message);
    }
};

/**
 * Send notification when HOST account is REJECTED
 */
const sendAccountRejectedNotification = async (telegramUserId, fullName) => {
    try {
        const message = `
❌ *Pendaftaran Ditolak*

Halo *${fullName}*,

Maaf, pendaftaran Anda tidak dapat disetujui saat ini.

Jika Anda merasa ini adalah kesalahan, silakan hubungi Manager untuk informasi lebih lanjut.

Terima kasih.
        `;

        await sendTelegramMessage(telegramUserId, message, { parse_mode: 'Markdown' });
        console.log(`✅ Rejection notification sent to ${fullName} (${telegramUserId})`);
    } catch (error) {
        console.error('❌ Send rejection notification error:', error.message);
    }
};

/**
 * Send notification when REPORT is VERIFIED
 */
const sendReportVerifiedNotification = async (telegramUserId, reportData) => {
    try {
        const formattedGMV = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(reportData.gmv);

        const formattedDate = new Date(reportData.createdAt).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const message = `
✅ *Laporan Diverifikasi!*

📊 *Report ID:* #${reportData.reportId}

💰 *GMV:* ${formattedGMV}
⏱️ *Durasi LIVE:* ${reportData.duration || 'Tidak terdeteksi'}
📅 *Tanggal:* ${formattedDate}

${reportData.notes ? `📝 *Catatan Manager:*\n${reportData.notes}\n\n` : ''}
Status: *VERIFIED* ✅

Selamat! Laporan Anda telah disetujui oleh Manager. 🎉

Terus pertahankan performa Anda! 💪
        `;

        await sendTelegramMessage(telegramUserId, message, { parse_mode: 'Markdown' });
        console.log(`✅ Verification notification sent for report #${reportData.reportId}`);
    } catch (error) {
        console.error('❌ Send verification notification error:', error.message);
    }
};

/**
 * Send notification when REPORT is REJECTED
 */
const sendReportRejectedNotification = async (telegramUserId, reportData) => {
    try {
        const formattedGMV = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(reportData.gmv);

        const formattedDate = new Date(reportData.createdAt).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const message = `
❌ *Laporan Ditolak*

📊 *Report ID:* #${reportData.reportId}

💰 *GMV:* ${formattedGMV}
⏱️ *Durasi LIVE:* ${reportData.duration || 'Tidak terdeteksi'}
📅 *Tanggal:* ${formattedDate}

${reportData.notes ? `📝 *Alasan Penolakan:*\n${reportData.notes}\n\n` : ''}
Status: *REJECTED* ❌

Silakan periksa kembali screenshot Anda dan kirim ulang laporan yang benar.

Jika ada pertanyaan, hubungi Manager Anda.
        `;

        await sendTelegramMessage(telegramUserId, message, { parse_mode: 'Markdown' });
        console.log(`✅ Rejection notification sent for report #${reportData.reportId}`);
    } catch (error) {
        console.error('❌ Send rejection notification error:', error.message);
    }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const downloadTelegramPhoto = async (fileId) => {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        const fileResponse = await axios.get(
            `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
        );

        if (!fileResponse.data.ok) {
            throw new Error('Failed to get file info from Telegram');
        }

        const filePath = fileResponse.data.result.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });

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
    sendTelegramMessage,
    sendAccountApprovedNotification,     // ✅ NEW
    sendAccountRejectedNotification,      // ✅ NEW
    sendReportVerifiedNotification,       // ✅ NEW
    sendReportRejectedNotification        // ✅ NEW
};