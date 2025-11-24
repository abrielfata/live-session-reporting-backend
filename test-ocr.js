const { extractTextFromImage, parseGMVFromText } = require('./services/ocrService');

async function testOCR() {
    console.log('🧪 Testing OCR Service...\n');

    // Test dengan sample text
    const sampleTexts = [
        'GMV: Rp 15.000.000',
        'Total GMV Rp15000000',
        'GMV 8.500.000',
        'Total: 12,500,000'
    ];

    console.log('📝 Testing GMV Parser:');
    sampleTexts.forEach(text => {
        const parsed = parseGMVFromText(text);
        console.log(`Input: "${text}" → Parsed GMV: ${parsed}`);
    });

    console.log('\n✅ OCR Service test completed!');
    console.log('💡 Untuk test dengan gambar asli, upload screenshot ke Telegram Bot');
}

testOCR();