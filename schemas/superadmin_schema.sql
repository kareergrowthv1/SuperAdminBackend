-- Superadmin Database Schema
-- Database: superadmin_db
-- This database stores credits aggregation, payments, and superadmin-specific data

CREATE DATABASE IF NOT EXISTS superadmin_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE superadmin_db;

-- Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id BINARY(16) NOT NULL PRIMARY KEY,
  client_schema VARCHAR(63) NOT NULL,
  admin_user_id CHAR(36) NOT NULL,
  admin_email VARCHAR(255) NOT NULL,
  
  -- Payment details
  payment_type ENUM('INTERVIEW_CREDITS', 'POSITION_CREDITS', 'SCREENING_CREDITS', 'SUBSCRIPTION', 'ADDON') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  
  -- Credit allocation (if applicable)
  interview_credits_added INT DEFAULT 0,
  position_credits_added INT DEFAULT 0,
  screening_credits_added INT DEFAULT 0,
  validity_extended_days INT DEFAULT 0,
  
  -- Payment status
  payment_status ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
  payment_method VARCHAR(50),
  transaction_id VARCHAR(255),
  transaction_reference VARCHAR(255),
  invoice_number VARCHAR(50),
  manual_reference_number VARCHAR(50),
  received_by VARCHAR(100),
  payment_notes TEXT,
  payment_proof_reference VARCHAR(255),
  payment_capture TINYINT(1) DEFAULT 1,
  
  -- Refund details
  refund_amount DECIMAL(10, 2) DEFAULT 0.00,
  refund_date TIMESTAMP NULL,
  refund_id VARCHAR(100),
  
  -- Payment gateway details
  gateway_name VARCHAR(50),
  gateway_response JSON,
  
  -- Timestamps
  payment_date TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_payments_client_schema (client_schema),
  INDEX idx_payments_admin_user_id (admin_user_id),
  INDEX idx_payments_status (payment_status),
  INDEX idx_payments_type (payment_type),
  INDEX idx_payments_date (payment_date),
  INDEX idx_payments_transaction_id (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Payment records for all admin clients';

-- Sync Status Table (tracks sync status with client DBs)
CREATE TABLE IF NOT EXISTS sync_status (
  id BINARY(16) NOT NULL PRIMARY KEY,
  client_schema VARCHAR(63) NOT NULL,
  sync_type ENUM('CREDITS', 'PAYMENTS', 'FULL') NOT NULL,
  
  -- Sync status
  last_sync_at TIMESTAMP NULL,
  last_sync_status ENUM('SUCCESS', 'FAILED', 'IN_PROGRESS') NOT NULL DEFAULT 'SUCCESS',
  error_message TEXT,
  records_synced INT DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes
  UNIQUE KEY uk_sync_status_client_type (client_schema, sync_type),
  INDEX idx_sync_status_last_sync (last_sync_at),
  INDEX idx_sync_status_status (last_sync_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tracks synchronization status with client databases';

-- Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
  id BINARY(16) NOT NULL PRIMARY KEY,
  organization_id CHAR(36) NOT NULL COMMENT 'Admin user ID from auth_db',
  payment_id BINARY(16),
  
  subscribed_products VARCHAR(100) DEFAULT 'INTERVIEW',
  billing_cycle ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM') DEFAULT 'ANNUAL',
  
  total_interview_credits INT DEFAULT 0,
  interview_credits_price DECIMAL(10, 2) DEFAULT 0.00,
  demo_interview_credits INT DEFAULT 0,
  
  total_position_credits INT DEFAULT 0,
  position_credits_price DECIMAL(10, 2) DEFAULT 0.00,
  
  total_screening_credits INT DEFAULT 0,
  screening_credits_price DECIMAL(10, 2) DEFAULT 0.00,
  
  tax_rate DECIMAL(5, 2) DEFAULT 18.00,
  tax_inclusive TINYINT(1) DEFAULT 0,
  
  sub_total DECIMAL(10, 2) DEFAULT 0.00,
  total_amount DECIMAL(10, 2) DEFAULT 0.00,
  grand_total_amount DECIMAL(10, 2) DEFAULT 0.00,
  
  valid_from TIMESTAMP NULL,
  valid_until TIMESTAMP NULL,
  
  status ENUM('ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELLED') DEFAULT 'ACTIVE',
  discount_percentage DECIMAL(5, 2) DEFAULT 0.00,
  discount_amount DECIMAL(10, 2) DEFAULT 0.00,
  discount_code VARCHAR(50),
  is_subscription TINYINT(1) DEFAULT 1,
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_subscriptions_org (organization_id),
  INDEX idx_subscriptions_payment (payment_id),
  INDEX idx_subscriptions_status (status),
  
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Subscription records for all admin clients';

-- ============================================================
-- 4. College Credits Aggregation Table (Synced from College Tenants)
-- ============================================================
CREATE TABLE IF NOT EXISTS college_credits (
  id BINARY(16) NOT NULL PRIMARY KEY,
  client_schema VARCHAR(63) NOT NULL COMMENT 'Client database schema name',
  organization_id BINARY(16) NOT NULL COMMENT 'Organization ID from tenant DB',
  admin_user_id CHAR(36) NOT NULL COMMENT 'Admin user ID from auth_db',
  admin_email VARCHAR(255) NOT NULL,
  
  -- Credits (College - No Screening)
  total_interview_credits INT NOT NULL DEFAULT 0,
  utilized_interview_credits INT NOT NULL DEFAULT 0,
  total_position_credits INT NOT NULL DEFAULT 0,
  utilized_position_credits INT NOT NULL DEFAULT 0,
  
  -- Validity
  valid_till DATE DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  
  -- Sync tracking
  last_synced_at TIMESTAMP NULL,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes
  UNIQUE KEY uk_college_credits_client (client_schema),
  INDEX idx_college_credits_admin (admin_user_id),
  INDEX idx_college_credits_active (is_active),
  INDEX idx_college_credits_valid_till (valid_till),
  INDEX idx_college_credits_synced (last_synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Aggregated college credits from all college tenant databases';

-- ============================================================
-- 5. ATS Credits Aggregation Table (Synced from ATS Tenants)
-- ============================================================
CREATE TABLE IF NOT EXISTS ats_credits (
  id BINARY(16) NOT NULL PRIMARY KEY,
  client_schema VARCHAR(63) NOT NULL COMMENT 'Client database schema name',
  organization_id BINARY(16) NOT NULL COMMENT 'Organization ID from tenant DB',
  admin_user_id CHAR(36) NOT NULL COMMENT 'Admin user ID from auth_db',
  admin_email VARCHAR(255) NOT NULL,
  
  -- Credits (ATS - With Screening)
  total_interview_credits INT NOT NULL DEFAULT 0,
  utilized_interview_credits INT NOT NULL DEFAULT 0,
  total_position_credits INT NOT NULL DEFAULT 0,
  utilized_position_credits INT NOT NULL DEFAULT 0,
  total_screening_credits INT NOT NULL DEFAULT 0,
  utilized_screening_credits INT NOT NULL DEFAULT 0,
  screening_credits_min INT NOT NULL DEFAULT 0,
  screening_credits_cost_per_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  
  -- Validity
  valid_till DATE DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  
  -- Sync tracking
  last_synced_at TIMESTAMP NULL,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes
  UNIQUE KEY uk_ats_credits_client (client_schema),
  INDEX idx_ats_credits_admin (admin_user_id),
  INDEX idx_ats_credits_active (is_active),
  INDEX idx_ats_credits_valid_till (valid_till),
  INDEX idx_ats_credits_synced (last_synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Aggregated ATS credits from all ATS tenant databases';

-- ============================================================
-- 6. Settings Table
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
    `key` VARCHAR(100) PRIMARY KEY,
    `value` TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initial Settings
INSERT IGNORE INTO settings (`key`, `value`) VALUES 
('minimumScreeningCredits', '0'),
('screeningCreditsCostPerPrice', '0.00'),
('emailSettings', '{"enabled":true,"apiUrl":"https://api.zeptomail.in/v1.1/email","apiKey":"PHtE6r0IQOrvjGN88EJTsaS6FpT1ZootrONmfwNH5YtCWPYATU1Vrtsrkz/mr0h8APgTHPObyIJv47rNtL+CdjnkPWpKDWqyqK3sx/VYSPOZsbq6x00atVobd0fVVIHoc9Fs1CTWuNjTNA==","fromEmail":"noreply@systemmindz.com","fromName":"KareerGrowth"}');

-- ============================================================
-- 6b. AI Config Table (OpenAI / AI provider settings from ref/backend_ai-main)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_config (
    id INT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
    provider VARCHAR(50) NOT NULL DEFAULT 'OPENAI',
    api_key VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'OpenAI API key (set via Superadmin Settings > AI Config)',
    base_url VARCHAR(500) NOT NULL DEFAULT 'https://api.openai.com/v1',
    model VARCHAR(100) NOT NULL DEFAULT 'gpt-3.5-turbo',
    temperature DECIMAL(3,2) NOT NULL DEFAULT 0.70,
    max_tokens INT UNSIGNED NOT NULL DEFAULT 1024,
    top_p DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    frequency_penalty DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    presence_penalty DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    stream TINYINT(1) NOT NULL DEFAULT 1,
    timeout INT UNSIGNED NOT NULL DEFAULT 300,
    chunk_size INT UNSIGNED NOT NULL DEFAULT 1024,
    retry_on_timeout TINYINT(1) NOT NULL DEFAULT 1,
    max_retries INT UNSIGNED NOT NULL DEFAULT 3,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OpenAI/AI provider config (single row, id=1)';

INSERT IGNORE INTO ai_config (id, provider, base_url, model) VALUES (1, 'OPENAI', 'https://api.openai.com/v1', 'gpt-3.5-turbo');

-- ============================================================
-- 7. Jobs Aggregation Table
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
  id BINARY(16) NOT NULL PRIMARY KEY,
  client_schema VARCHAR(63) NOT NULL COMMENT 'Database schema name of the client',
  client_name VARCHAR(100) NOT NULL COMMENT 'Name of the admin client organization',
  admin_user_id CHAR(36) NOT NULL COMMENT 'Admin user ID from auth_db',
  admin_email VARCHAR(255) NOT NULL,
  
  -- Job details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  position_type VARCHAR(50) DEFAULT 'Full-time',
  location VARCHAR(100),
  experience_range VARCHAR(50),
  
  -- Stats (synced from client DB)
  applications_count INT DEFAULT 0,
  
  -- Status
  status ENUM('OPEN', 'CLOSED', 'DRAFT', 'ARCHIVED') NOT NULL DEFAULT 'OPEN',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_jobs_client_schema (client_schema),
  INDEX idx_jobs_admin_user_id (admin_user_id),
  INDEX idx_jobs_status (status),
  INDEX idx_jobs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Aggregated jobs from all admin client databases';
