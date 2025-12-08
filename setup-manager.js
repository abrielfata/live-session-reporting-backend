const { query } = require('./config/db');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function setupManager() {
    console.log('🔧 ========== SETUP MANAGER ACCOUNT ==========\n');
    
    // Prompt untuk data manager
    rl.question('Telegram User ID Manager (e.g., 123456789): ', (telegram_user_id) => {
        rl.question('Full Name (e.g., Manager Utama): ', (full_name) => {
            rl.question('Username (e.g., manager_admin): ', (username) => {
                rl.question('Password (min 6 characters): ', async (password) => {
                    
                    // Validasi
                    if (password.length < 6) {
                        console.error('\n❌ Password must be at least 6 characters!');
                        rl.close();
                        process.exit(1);
                    }
                    
                    try {
                        // Hash password
                        console.log('\n🔐 Hashing password...');
                        const password_hash = await bcrypt.hash(password, 10);
                        
                        // Check if manager exists
                        const checkQuery = 'SELECT id FROM users WHERE telegram_user_id = $1';
                        const existing = await query(checkQuery, [telegram_user_id]);
                        
                        if (existing.rows.length > 0) {
                            // Update existing
                            console.log('📝 Updating existing manager...');
                            const updateQuery = `
                                UPDATE users 
                                SET 
                                    username = $1,
                                    full_name = $2,
                                    password_hash = $3,
                                    role = 'MANAGER',
                                    is_active = true,
                                    is_approved = true,
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE telegram_user_id = $4
                                RETURNING id, telegram_user_id, username, full_name, role
                            `;
                            
                            const result = await query(updateQuery, [
                                username,
                                full_name,
                                password_hash,
                                telegram_user_id
                            ]);
                            
                            console.log('\n✅ Manager updated successfully!');
                            console.log('\n📋 Manager Details:');
                            console.table(result.rows);
                            
                        } else {
                            // Insert new
                            console.log('📝 Creating new manager...');
                            const insertQuery = `
                                INSERT INTO users (
                                    telegram_user_id,
                                    username,
                                    full_name,
                                    role,
                                    password_hash,
                                    is_active,
                                    is_approved
                                ) VALUES ($1, $2, $3, 'MANAGER', $4, true, true)
                                RETURNING id, telegram_user_id, username, full_name, role
                            `;
                            
                            const result = await query(insertQuery, [
                                telegram_user_id,
                                username,
                                full_name,
                                password_hash
                            ]);
                            
                            console.log('\n✅ Manager created successfully!');
                            console.log('\n📋 Manager Details:');
                            console.table(result.rows);
                        }
                        
                        console.log('\n🔐 Login Credentials:');
                        console.log('   User ID:', telegram_user_id);
                        console.log('   Password:', password);
                        console.log('\n💡 You can now login to the dashboard!');
                        
                    } catch (error) {
                        console.error('\n❌ Error:', error.message);
                    } finally {
                        rl.close();
                        process.exit(0);
                    }
                });
            });
        });
    });
}

setupManager();