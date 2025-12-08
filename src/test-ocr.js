const { extractTextFromImage, parseGMVFromText, parseDurationFromText } = require('./services/ocrService');

async function testOCR() {
    console.log('🧪 Testing OCR Service...\n');

    // Test GMV Parser
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

    // ✅ TAMBAHKAN TEST DURATION
    console.log('\n⏱️ Testing Duration Parser:');
    const durationTexts = [
        'Durasi: 2 jam',
        'Durasi: 1 jam 30 menit',
        'Durasi 45 menit',
        'Durasi: 3 jam 15 mnt',
        '2 jam',
        'Random text without duration'
    ];

    durationTexts.forEach(text => {
        const parsed = parseDurationFromText(text);
        console.log(`Input: "${text}" → Parsed Duration: ${parsed || 'Not found'}`);
    });

    console.log('\n✅ OCR Service test completed!');
}

testOCR();