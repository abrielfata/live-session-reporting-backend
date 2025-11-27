const express = require('express');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// Import routes
const authRoutes = require('./routes/authRoutes');
const telegramRoutes = require('./routes/telegramRoutes');
const reportRoutes = require('./routes/reportRoutes'); 
const userRoutes = require('./routes/userRoutes'); 

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Live Session Reporting API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            auth: '/api/auth',
            webhook: '/api/webhook',
            reports: '/api/reports'
        }
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/webhook', telegramRoutes);
app.use('/api/reports', reportRoutes); // ✅ FIXED: Added missing route
app.use('/api/users', userRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.originalUrl
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 API URL: http://localhost:${PORT}`);
    console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`\n📋 Available Routes:`);
    console.log(`   POST   /api/auth/login`);
    console.log(`   GET    /api/auth/me`);
    console.log(`   POST   /api/webhook/telegram`);
    console.log(`   GET    /api/users/pending (Manager)`); // ✅ TAMBAHKAN INI
    console.log(`   PUT    /api/users/:userId/approve (Manager)`); // ✅ TAMBAHKAN INI
    console.log(`   DELETE /api/users/:userId/reject (Manager)`); 
    console.log(`   GET    /api/reports (Manager)`);
    console.log(`   GET    /api/reports/statistics (Manager)`);
    console.log(`   GET    /api/reports/my-reports (Host)`);
    console.log(`   GET    /api/reports/:id`);
    console.log(`   PUT    /api/reports/:id/status (Manager)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('⚠️  SIGTERM received, closing server gracefully');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});