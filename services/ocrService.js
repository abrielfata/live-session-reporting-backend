const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

/**
 * Ekstrak teks dari gambar menggunakan OCR.Space API
 */
const extractTextFromImage = async (imagePath = null, imageUrl = null) => {
    try {
        const apiKey = process.env.OCRSPACE_API_KEY;

        if (!apiKey) {
            throw new Error('OCRSPACE_API_KEY not configured in .env');
        }

        const formData = new FormData();
        formData.append('apikey', apiKey);
        formData.append('language', 'eng');
        formData.append('isOverlayRequired', 'false');
        formData.append('detectOrientation', 'true');
        formData.append('scale', 'true');
        formData.append('OCREngine', '1');

        if (imagePath && fs.existsSync(imagePath)) {
            formData.append('file', fs.createReadStream(imagePath));
            console.log('📤 Sending image file to OCR.Space...');
        } else if (imageUrl) {
            formData.append('url', imageUrl);
            console.log('📤 Sending image URL to OCR.Space...');
        } else {
            throw new Error('No valid image path or URL provided');
        }

        const response = await axios.post(
            'https://api.ocr.space/parse/image',
            formData,
            {
                headers: {
                    ...formData.getHeaders()
                },
                // Timeout yang panjang untuk mengakomodasi free tier
                timeout: 900000 
            }
        );

        if (!response.data || response.data.IsErroredOnProcessing) {
            throw new Error(
                response.data?.ErrorMessage?.[0] || 'OCR processing failed'
            );
        }

        const ocrResult = response.data.ParsedResults[0];
        const rawText = ocrResult.ParsedText;

        console.log('✅ OCR Success! Raw text length:', rawText.length);
        console.log('📄 Raw OCR Text:', rawText.substring(0, 300));

        // Parse GMV dari text
        const parsedGMV = parseGMVFromText(rawText);

        return {
            success: true,
            rawText: rawText,
            parsedGMV: parsedGMV,
            confidence: ocrResult.TextOrientation || 0
        };

    } catch (error) {
        console.error('❌ OCR Service Error:', error.message);
        
        if (error.response) {
            console.error('OCR API Response Error:', error.response.data);
        }

        return {
            success: false,
            error: error.message,
            rawText: null,
            parsedGMV: 0
        };
    }
};

/**
 * Parse GMV dari raw text OCR - Enhanced dengan Prioritas GMV Langsung dan dukungan 'K'
 */
const parseGMVFromText = (text) => {
    try {
        console.log('\n🔍 Starting GMV parsing...');
        
        let cleanText = text.replace(/\s+/g, ' ').toUpperCase();
        console.log('📝 Cleaned text:', cleanText.substring(0, 200));

        // Regex untuk menangkap angka dengan 'K', separator, atau gabungan
        const numericRegex = /[\d.,K]+/i;

        // ===================================
        // PRIORITY 1: GMV LANGSUNG (sesuai permintaan user)
        // Match GMV LANGSUNG, membiarkan karakter apa pun (seperti O atau spasi) di antaranya
        // ===================================
        const directMatch = cleanText.match(new RegExp(`GMV\\s*LANGSUNG[^a-zA-Z]*RP\\s*(${numericRegex.source})`, 'i'));
        
        if (directMatch && directMatch[1]) {
            const gmv = applyMultiplier(directMatch[1]);
            if (gmv > 0) {
                console.log('✅ Found GMV (PRIORITY: LANGSUNG):', gmv);
                return gmv; // Mengembalikan GMV Langsung dan berhenti
            }
        }

        // ===================================
        // PRIORITY 2: GMV BIASA / GMV TOTAL (Fallback)
        // ===================================
        const totalMatch = cleanText.match(new RegExp(`GMV[^a-zA-Z]*RP\\s*(${numericRegex.source})`, 'i'));
        if (totalMatch && totalMatch[1]) {
            const gmv = applyMultiplier(totalMatch[1]);
            if (gmv > 0) {
                console.log('✅ Found GMV (Fallback: Total GMV):', gmv);
                return gmv;
            }
        }
        
        // ===================================
        // PRIORITY 3: Max Rupiah (Fallback Terakhir)
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
                console.log('✅ Found GMV (Pattern 3 - Max Rupiah):', maxAmount);
                return maxAmount;
            }
        }

        // PATTERN 4: Angka tanpa Rp (diabaikan untuk menjaga fokus pada Rupiah)
        
        console.log('⚠️ No GMV pattern found, returning 0');
        return 0;

    } catch (error) {
        console.error('❌ Parse GMV Error:', error.message);
        return 0;
    }
};

/**
 * Menerapkan pengali (K = 1000) dan membersihkan string angka menjadi number (float).
 */
const applyMultiplier = (numStr) => {
    let multiplier = 1;
    let tempStr = numStr.toUpperCase();

    // 1. Cek Suffix 'K'
    if (tempStr.endsWith('K')) {
        multiplier = 1000;
        tempStr = tempStr.slice(0, -1); // Hapus 'K'
    }

    // 2. Bersihkan dan konversi (menggunakan float untuk desimal)
    const num = cleanNumber(tempStr);
    
    return num * multiplier;
};

/**
 * FIXED: Bersihkan string angka menjadi FLOAT.
 * Mengganti koma desimal (,) menjadi titik (.) dan menghapus pemisah ribuan (.).
 */
const cleanNumber = (numStr) => {
    try {
        // Asumsi format Indonesia: Titik adalah pemisah ribuan, Koma adalah pemisah desimal
        let cleaned = numStr.replace(/\./g, ''); // Hapus semua titik (pemisah ribuan)
        cleaned = cleaned.replace(/,/g, '.'); // Ganti koma (pemisah desimal) menjadi titik
        
        // Hapus karakter non-digit/non-titik lainnya.
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
    isValidGMV
};