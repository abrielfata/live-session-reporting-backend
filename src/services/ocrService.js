const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

/**
 * Ekstrak teks dari gambar dengan retry mechanism
 */
const extractTextFromImage = async (imagePath = null, imageUrl = null, retryCount = 0) => {
    const maxRetries = parseInt(process.env.OCR_MAX_RETRIES || '3', 10);
    const timeout = parseInt(process.env.OCR_TIMEOUT_MS || '45000', 10); // default 45 detik

    try {
        console.log(`\n🔍 ========== OCR ATTEMPT ${retryCount + 1}/${maxRetries + 1} ==========`);
        console.log('📂 Image Path:', imagePath);
        
        const apiKey = process.env.OCRSPACE_API_KEY;

        if (!apiKey) {
            console.error('❌ OCRSPACE_API_KEY not configured');
            throw new Error('OCRSPACE_API_KEY not configured in .env');
        }

        const formData = new FormData();
        formData.append('apikey', apiKey);
        formData.append('language', 'eng');
        formData.append('isOverlayRequired', 'false');
        formData.append('detectOrientation', 'true');
        formData.append('scale', 'true');
        formData.append('OCREngine', '2'); // Engine 2 lebih baik untuk angka

        if (imagePath && fs.existsSync(imagePath)) {
            const fileStats = fs.statSync(imagePath);
            console.log('📊 File Size:', (fileStats.size / 1024).toFixed(2), 'KB');
            
            formData.append('file', fs.createReadStream(imagePath));
        } else if (imageUrl) {
            formData.append('url', imageUrl);
        } else {
            throw new Error('No valid image path or URL provided');
        }

        console.log('⏳ Sending to OCR.Space API...');
        const startTime = Date.now();

        const response = await axios.post(
            'https://api.ocr.space/parse/image',
            formData,
            {
                headers: {
                    ...formData.getHeaders()
                },
                timeout: timeout
            }
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`⏱️ Response Time: ${duration}s`);

        if (!response.data) {
            throw new Error('Empty response from OCR.Space');
        }

        console.log('📨 OCR Exit Code:', response.data.OCRExitCode);
        
        if (response.data.IsErroredOnProcessing) {
            const errorMsg = response.data.ErrorMessage?.[0] || 'Unknown OCR error';
            console.error('❌ OCR Processing Error:', errorMsg);
            throw new Error(errorMsg);
        }

        if (!response.data.ParsedResults || response.data.ParsedResults.length === 0) {
            throw new Error('No text detected in image');
        }

        const ocrResult = response.data.ParsedResults[0];
        const rawText = ocrResult.ParsedText;

        console.log('✅ OCR Success! Text length:', rawText.length);
        console.log('📄 Raw Text (first 300 chars):', rawText.substring(0, 300));

        // Parse GMV dari text
        const parsedGMV = parseGMVFromText(rawText);
        const parsedDuration = parseDurationFromText(rawText);

        console.log('💰 Parsed GMV:', parsedGMV);
        console.log('⏱️ Parsed Duration:', parsedDuration || 'Not found');
        console.log('========== OCR SUCCESS ==========\n');

        return {
            success: true,
            rawText: rawText,
            parsedGMV: parsedGMV,
            parsedDuration: parsedDuration,
            confidence: ocrResult.TextOrientation || 0
        };

    } catch (error) {
        console.error(`❌ OCR Attempt ${retryCount + 1} Failed:`, error.message);

        // Retry jika belum max retries dan bukan API key error
        if (retryCount < maxRetries && !error.message.includes('API')) {
            const waitTime = (retryCount + 1) * 2; // 2s, 4s, 6s
            console.log(`🔄 Retrying in ${waitTime} seconds...`);
            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
            return extractTextFromImage(imagePath, imageUrl, retryCount + 1);
        }

        console.error('❌ All OCR attempts failed');
        console.log('========== OCR FAILED ==========\n');

        return {
            success: false,
            error: error.message,
            rawText: null,
            parsedGMV: 0
        };
    }
};

/**
 * Parse GMV dari raw text OCR
 */
const parseGMVFromText = (text) => {
    try {
        console.log('\n🔍 Starting GMV parsing...');
        
        let cleanText = text.replace(/\s+/g, ' ').toUpperCase();
        // Toleransi kesalahan OCR: BMV/GMY/GMW sering salah baca sebagai GMV
        cleanText = cleanText
            .replace(/BMV/g, 'GMV')
            .replace(/GMY/g, 'GMV')
            .replace(/GMW/g, 'GMV');
        console.log('📝 Cleaned text (first 200 chars):', cleanText.substring(0, 200));

        const numericRegex = /[\d.,K]+/i;

        // ===================================
        // PRIORITY 1: GMV LANGSUNG
        // ===================================
        const directMatch = cleanText.match(new RegExp(`GMV\\s*LANGSUNG[^a-zA-Z]*RP\\s*(${numericRegex.source})`, 'i'));
        
        if (directMatch && directMatch[1]) {
            const gmv = applyMultiplier(directMatch[1]);
            if (gmv > 0) {
                console.log('✅ Found GMV (PRIORITY: LANGSUNG):', gmv);
                return gmv;
            }
        }

        // ===================================
        // PRIORITY 2: GMV TOTAL
        // ===================================
        const totalMatch = cleanText.match(new RegExp(`GMV[^a-zA-Z]*RP\\s*(${numericRegex.source})`, 'i'));
        if (totalMatch && totalMatch[1]) {
            const gmv = applyMultiplier(totalMatch[1]);
            if (gmv > 0) {
                console.log('✅ Found GMV (Total):', gmv);
                return gmv;
            }
        }
        
        // ===================================
        // PRIORITY 3: Max Rupiah
        // ===================================
        const rupiah = cleanText.match(new RegExp(`RP\\s*(${numericRegex.source})`, 'gi'));
        if (rupiah && rupiah.length > 0) {
            console.log('💰 Found Rupiah values:', rupiah);
            
            const amounts = rupiah.map(r => {
                let numStr = r.replace(/RP\s*/i, '');
                return applyMultiplier(numStr);
            }).filter(n => n > 0);

            if (amounts.length > 0) {
                const maxAmount = Math.max(...amounts);
                console.log('✅ Found GMV (Max Rupiah):', maxAmount);
                return maxAmount;
            }
        }

        console.log('⚠️ No GMV pattern found, returning 0');
        return 0;

    } catch (error) {
        console.error('❌ Parse GMV Error:', error.message);
        return 0;
    }
};
/**
 * Parse Durasi dari raw text OCR
 */
const parseDurationFromText = (text) => {
    try {
        console.log('\n⏱️ Starting Duration parsing...');
        
        let cleanText = text.replace(/\s+/g, ' ').trim();
        console.log('📝 Text for duration (first 300 chars):', cleanText.substring(0, 300));

        // Pattern 1: "Durasi: X jam Y menit" atau "Durasi: X jam"
        const pattern1 = /Durasi[:\s]*(\d+)\s*jam(?:\s*(\d+)\s*(?:menit|mnt))?/i;
        const match1 = cleanText.match(pattern1);
        
        if (match1) {
            const hours = parseInt(match1[1]) || 0;
            const minutes = parseInt(match1[2]) || 0;
            
            if (hours > 0 || minutes > 0) {
                let duration = '';
                if (hours > 0) duration += `${hours} jam`;
                if (minutes > 0) {
                    if (duration) duration += ' ';
                    duration += `${minutes} menit`;
                }
                
                console.log('✅ Found Duration (Pattern 1):', duration);
                return duration;
            }
        }

        // Pattern 2: "Durasi: X menit" saja
        const pattern2 = /Durasi[:\s]*(\d+)\s*(?:menit|mnt)/i;
        const match2 = cleanText.match(pattern2);
        
        if (match2) {
            const minutes = parseInt(match2[1]) || 0;
            if (minutes > 0) {
                const duration = `${minutes} menit`;
                console.log('✅ Found Duration (Pattern 2):', duration);
                return duration;
            }
        }

        // Pattern 3: Hanya angka jam "X jam"
        const pattern3 = /(\d+)\s*jam/i;
        const match3 = cleanText.match(pattern3);
        
        if (match3) {
            const hours = parseInt(match3[1]) || 0;
            if (hours > 0 && hours <= 24) {
                const duration = `${hours} jam`;
                console.log('✅ Found Duration (Pattern 3):', duration);
                return duration;
            }
        }

        console.log('⚠️ No Duration pattern found');
        return null;

    } catch (error) {
        console.error('❌ Parse Duration Error:', error.message);
        return null;
    }
};
/**
 * Apply multiplier (K = 1000)
 */
const applyMultiplier = (numStr) => {
    let multiplier = 1;
    let tempStr = numStr.toUpperCase();

    // Check suffix 'K'
    if (tempStr.endsWith('K')) {
        multiplier = 1000;
        tempStr = tempStr.slice(0, -1);
    }

    // Clean dan convert to float
    const num = cleanNumber(tempStr);
    
    return num * multiplier;
};

/**
 * Clean number string
 */
const cleanNumber = (numStr) => {
    try {
        // Format Indonesia: titik = ribuan, koma = desimal
        let cleaned = numStr.replace(/\./g, ''); // Hapus titik (ribuan)
        cleaned = cleaned.replace(/,/g, '.'); // Koma jadi titik (desimal)
        
        // Hapus karakter non-digit/non-titik
        const finalCleaned = cleaned.replace(/[^\d.]/g, '');
        const num = parseFloat(finalCleaned);
        
        return isNaN(num) ? 0 : num;
    } catch (error) {
        return 0;
    }
};

/**
 * Validasi GMV
 */
const isValidGMV = (gmv) => {
    return gmv && gmv > 0 && gmv < 10000000000; // Max 10 Miliar
};

module.exports = {
    extractTextFromImage,
    parseGMVFromText,
    parseDurationFromText,
    isValidGMV
};