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
        formData.append('OCREngine', '2');

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
                timeout: 30000
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
 * Parse GMV dari raw text OCR - Enhanced untuk format Indonesia
 */
const parseGMVFromText = (text) => {
    try {
        console.log('\n🔍 Starting GMV parsing...');
        
        // Bersihkan text
        let cleanText = text.replace(/\s+/g, ' ').toUpperCase();
        console.log('📝 Cleaned text:', cleanText.substring(0, 200));

        // === PATTERN 1: GMV Langsung / GMV Total ===
        const gmvPatterns = [
            /GMV\s*LANGSUNG[:\s]*RP\s*([\d.,]+)/i,
            /GMV\s*TOTAL[:\s]*RP\s*([\d.,]+)/i,
            /GMV[:\s]*RP\s*([\d.,]+)/i,
            /TOTAL\s*GMV[:\s]*RP\s*([\d.,]+)/i,
        ];

        for (const pattern of gmvPatterns) {
            const match = cleanText.match(pattern);
            if (match && match[1]) {
                const gmv = cleanNumber(match[1]);
                if (gmv > 0) {
                    console.log('✅ Found GMV (Pattern 1):', gmv);
                    return gmv;
                }
            }
        }

        // === PATTERN 2: Format "Rp0" atau "Rp 15.000" ===
        const rupiah = cleanText.match(/RP\s*([\d.,]+)/gi);
        if (rupiah && rupiah.length > 0) {
            console.log('💰 Found Rupiah values:', rupiah);
            
            const amounts = rupiah.map(r => {
                const numStr = r.replace(/RP\s*/i, '');
                return cleanNumber(numStr);
            }).filter(n => n > 0);

            if (amounts.length > 0) {
                const maxAmount = Math.max(...amounts);
                console.log('✅ Found GMV (Pattern 2 - Max Rupiah):', maxAmount);
                return maxAmount;
            }
        }

        // === PATTERN 3: Angka tanpa Rp (ambil yang terbesar) ===
        const numbers = cleanText.match(/\d{1,3}(?:[.,]\d{3})+|\d+/g);
        if (numbers && numbers.length > 0) {
            console.log('🔢 Found numbers:', numbers);
            
            const parsedNumbers = numbers
                .map(num => cleanNumber(num))
                .filter(num => num >= 1000 && num < 10000000000); // Filter: min 1K, max 10M
            
            if (parsedNumbers.length > 0) {
                const maxNumber = Math.max(...parsedNumbers);
                console.log('✅ Found GMV (Pattern 3 - Largest number):', maxNumber);
                return maxNumber;
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
 * Bersihkan string angka menjadi number
 */
const cleanNumber = (numStr) => {
    try {
        // Hapus semua karakter kecuali angka
        const cleaned = numStr.replace(/[^\d]/g, '');
        const num = parseInt(cleaned, 10);
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