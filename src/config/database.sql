-- ============================================
-- DATABASE: live_session_db
-- DESCRIPTION: Schema untuk Live Session Reporting System
-- ============================================

-- Hapus tabel jika sudah ada (untuk development)
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- TABLE: users
-- DESCRIPTION: Menyimpan data user (Manager & Host)
-- ============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    telegram_user_id VARCHAR(50) UNIQUE NOT NULL,
    username VARCHAR(100),
    full_name VARCHAR(200),
    role VARCHAR(20) NOT NULL CHECK (role IN ('MANAGER', 'HOST')),
    password_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index untuk performa query
CREATE INDEX idx_users_telegram_id ON users(telegram_user_id);
CREATE INDEX idx_users_role ON users(role);

-- ============================================
-- TABLE: reports
-- DESCRIPTION: Menyimpan laporan live session dari host
-- ============================================
CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_gmv DECIMAL(15, 2) NOT NULL DEFAULT 0,
    screenshot_url TEXT,
    ocr_raw_text TEXT,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index untuk performa query
CREATE INDEX idx_reports_host_id ON reports(host_id);
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX idx_reports_status ON reports(status);

-- ============================================
-- SAMPLE DATA untuk Testing
-- ============================================

-- Insert Manager (untuk login dashboard)
INSERT INTO users (telegram_user_id, username, full_name, role, password_hash) 
VALUES 
    ('123456789', 'manager_user', 'Manager Utama', 'MANAGER', '$2a$10$dummyhash'),
    ('987654321', 'host_andi', 'Andi Prasetyo', 'HOST', NULL);

-- Insert Sample Reports (untuk testing dashboard)
INSERT INTO reports (host_id, reported_gmv, screenshot_url, ocr_raw_text, status) 
VALUES 
    (2, 15000000.00, 'https://example.com/screenshot1.jpg', 'GMV: Rp 15.000.000', 'VERIFIED'),
    (2, 8500000.00, 'https://example.com/screenshot2.jpg', 'GMV: Rp 8.500.000', 'PENDING');

-- ============================================
-- VIEW: Laporan dengan Info Host
-- ============================================
CREATE OR REPLACE VIEW v_reports_with_host AS
SELECT 
    r.id,
    r.reported_gmv,
    r.screenshot_url,
    r.status,
    r.created_at,
    u.telegram_user_id,
    u.username AS host_username,
    u.full_name AS host_full_name
FROM reports r
JOIN users u ON r.host_id = u.id
ORDER BY r.created_at DESC;

-- ============================================
-- FUNCTION: Update timestamp otomatis
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk auto-update timestamp
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reports_updated_at 
    BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- GRANT PERMISSIONS (sesuaikan dengan user DB Anda)
-- ============================================
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_db_user;