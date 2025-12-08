require('./config/env');
const { setupWebhook } = require('./controllers/telegramController');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🤖 Telegram Webhook Setup\n');

rl.question('Masukkan ngrok URL (https://pseudosatirically-strepitous-dianna.ngrok-free.dev): ', async (ngrokUrl) => {
    // Bersihkan URL dari trailing slash
    const cleanUrl = ngrokUrl.trim().replace(/\/$/, '');
    
    // Webhook URL lengkap
    const webhookUrl = `${cleanUrl}/api/webhook/telegram`;
    
    console.log('\n📡 Setting webhook to:', webhookUrl);
    console.log('⏳ Please wait...\n');
    
    const result = await setupWebhook(webhookUrl);
    
    if (result.success) {
        console.log('✅ Webhook berhasil diatur!');
        console.log('\n📋 Testing Instructions:');
        console.log('1. Buka Telegram dan cari bot Anda');
        console.log('2. Kirim perintah /start');
        console.log('3. Kirim screenshot GMV');
        console.log('4. Bot akan otomatis memproses dan menyimpan laporan\n');
    } else {
        console.log('❌ Webhook setup failed:', result.error);
    }
    
    rl.close();
    process.exit(0);
});