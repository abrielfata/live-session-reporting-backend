const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

/**
 * OCR SERVICE
 * Mengintegrasikan dengan OCR.Space API untuk ekstraksi teks dari gambar
 */

/**
 * Ekstrak teks dari gambar menggunakan OCR.Space API
 * @param {String} imagePath - Path file gambar lokal
 * @param {String} imageUrl - URL gambar (alternatif dari imagePath)
 * @returns {Object} - Result OCR dengan raw text dan parsed GMV
 */
const extractTextFromImage = async (imagePath = null, imageUrl = null) => {
    try {
        const apiKey = process.env.OCRSPACE_API_KEY;

        if (!apiKey) {
            throw new Error('OCRSPACE_API_KEY not configured in .env');
        }

        // Setup form data
        const formData = new FormData();
        formData.append('apikey', apiKey);
        formData.append('language', 'eng');
        formData.append('isOverlayRequired', 'false');
        formData.append('detectOrientation', 'true');
        formData.append('scale', 'true');
        formData.append('OCREngine', '2'); // Engine 2 lebih akurat

        // Gunakan imagePath atau imageUrl
        if (imagePath && fs.existsSync(imagePath)) {
            formData.append('file', fs.createReadStream(imagePath));
            console.log('📤 Sending image file to OCR.Space...');
        } else if (imageUrl) {
            formData.append('url', imageUrl);
            console.log('📤 Sending image URL to OCR.Space...');
        } else {
            throw new Error('No valid image path or URL provided');
        }

        // Kirim request ke OCR.Space API
        const response = await axios.post(
            'https://api.ocr.space/parse/image',
            formData,
            {
                headers: {
                    ...formData.getHeaders()
                },
                timeout: 30000 // 30 detik timeout
            }
        );

        // Cek response OCR
        if (!response.data || response.data.IsErroredOnProcessing) {
            throw new Error(
                response.data?.ErrorMessage?.[0] || 'OCR processing failed'
            );
        }

        const ocrResult = response.data.ParsedResults[0];
        const rawText = ocrResult.ParsedText;

        console.log('✅ OCR Success! Raw text length:', rawText.length);
        console.log('📄 Raw OCR Text:', rawText.substring(0, 200) + '...');

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
        
        // Handle specific errors
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
 * Parse GMV dari raw text OCR
 * Mencari pattern angka yang kemungkinan adalah GMV
 * @param {String} text - Raw text dari OCR
 * @returns {Number} - GMV dalam bentuk number
 */
const parseGMVFromText = (text) => {
    try {
        // Pattern untuk mencari GMV
        // Contoh format yang dicari:
        // - GMV: Rp 15.000.000
        // - GMV Rp15000000
        // - Total: 15,000,000
        // - 15.000.000

        // Hapus semua karakter kecuali angka, titik, koma, dan Rp
        let cleanText = text.replace(/\s+/g, ' ').toUpperCase();

        // Pattern 1: GMV: Rp 15.000.000 atau GMV 15.000.000
        let gmvMatch = cleanText.match(/GMV[:\s]*(?:RP)?[\s]*([\d.,]+)/i);
        
        // Pattern 2: Total: 15.000.000
        if (!gmvMatch) {
            gmvMatch = cleanText.match(/TOTAL[:\s]*(?:RP)?[\s]*([\d.,]+)/i);
        }

        // Pattern 3: Cari angka besar (> 100.000)
        if (!gmvMatch) {
            const numbers = cleanText.match(/[\d.,]+/g);
            if (numbers) {
                // Ambil angka terbesar
                const parsedNumbers = numbers.map(num => {
                    return parseFloat(num.replace(/[.,]/g, ''));
                }).filter(num => num > 100000);

                if (parsedNumbers.length > 0) {
                    const maxNumber = Math.max(...parsedNumbers);
                    console.log('📊 Parsed GMV from largest number:', maxNumber);
                    return maxNumber;
                }
            }
        }

        if (gmvMatch && gmvMatch[1]) {
            // Bersihkan angka dari titik dan koma
            const cleanNumber = gmvMatch[1].replace(/[.,]/g, '');
            const gmvValue = parseFloat(cleanNumber);

            console.log('📊 Parsed GMV:', gmvValue);
            return gmvValue;
        }

        console.log('⚠️ No GMV pattern found in text, returning 0');
        return 0;

    } catch (error) {
        console.error('❌ Parse GMV Error:', error.message);
        return 0;
    }
};

/**
 * Validasi GMV
 * @param {Number} gmv - Nilai GMV
 * @returns {Boolean} - True jika valid
 */
const isValidGMV = (gmv) => {
    return gmv && gmv > 0 && gmv < 1000000000; // Max 1 Miliar
};

module.exports = {
    extractTextFromImage,
    parseGMVFromText,
    isValidGMV
};