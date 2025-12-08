const { Pool } = require('pg');
require('dotenv').config();

// Konfigurasi connection pool PostgreSQL
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 20, // Maksimal 20 koneksi
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test koneksi saat aplikasi start
pool.on('connect', () => {
    console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
    process.exit(-1);
});

// Helper function untuk query
const query = (text, params) => pool.query(text, params);

module.exports = {
    pool,
    query
};