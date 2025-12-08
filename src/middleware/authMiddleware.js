const jwt = require('jsonwebtoken');

/**
 * MIDDLEWARE: Verifikasi JWT Token
 * Melindungi route yang memerlukan autentikasi
 */
const verifyToken = (req, res, next) => {
    try {
        // Ambil token dari header Authorization
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

        // Jika token tidak ada
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        // Verifikasi token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Simpan data user ke request object
        req.user = decoded;
        
        console.log(`✅ Token verified for user: ${decoded.telegram_user_id} (${decoded.role})`);
        
        // Lanjutkan ke handler berikutnya
        next();

    } catch (error) {
        console.error('❌ Token verification failed:', error.message);
        
        // Handle expired token
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired. Please login again.'
            });
        }

        // Handle invalid token
        return res.status(403).json({
            success: false,
            message: 'Invalid token.'
        });
    }
};

/**
 * MIDDLEWARE: Verifikasi Role User
 * Melindungi route yang hanya untuk role tertentu
 */
const verifyRole = (...allowedRoles) => {
    return (req, res, next) => {
        try {
            // Cek apakah user memiliki role yang diizinkan
            if (!req.user || !allowedRoles.includes(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Insufficient permissions.'
                });
            }

            console.log(`✅ Role verified: ${req.user.role}`);
            next();

        } catch (error) {
            console.error('❌ Role verification failed:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    };
};

module.exports = {
    verifyToken,
    verifyRole
};