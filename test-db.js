const { query } = require('./config/db');

async function testConnection() {
    try {
        const result = await query('SELECT NOW() as current_time, version() as pg_version');
        console.log('✅ Database Connection Test:');
        console.log('Current Time:', result.rows[0].current_time);
        console.log('PostgreSQL Version:', result.rows[0].pg_version);
        
        // Test query ke tabel users
        const users = await query('SELECT id, username, role FROM users');
        console.log('\n📊 Sample Users:');
        console.table(users.rows);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Database Connection Failed:', error.message);
        process.exit(1);
    }
}

testConnection();