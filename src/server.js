const app = require('./app');
const { PORT, NODE_ENV } = require('./config/env');

const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 API URL: http://localhost:${PORT}`);
    console.log(`🔒 Environment: ${NODE_ENV}`);
    console.log(`\n📋 Available Routes:`);
    console.log(`   POST   /api/auth/login`);
    console.log(`   GET    /api/auth/me`);
    console.log(`   POST   /api/webhook/telegram`);
    console.log(`   GET    /api/users/pending (Manager)`);
    console.log(`   PUT    /api/users/:userId/approve (Manager)`);
    console.log(`   DELETE /api/users/:userId/reject (Manager)`);
    console.log(`   GET    /api/hosts (Manager)`); // ✅ NEW
    console.log(`   POST   /api/hosts (Manager)`); // ✅ NEW
    console.log(`   PUT    /api/hosts/:id (Manager)`); // ✅ NEW
    console.log(`   DELETE /api/hosts/:id (Manager)`); // ✅ NEW
    console.log(`   PATCH  /api/hosts/:id/toggle-status (Manager)`); // ✅ NEW
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