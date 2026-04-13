-- Create credits_history table
CREATE TABLE IF NOT EXISTS credits_history (
  id BINARY(16) NOT NULL PRIMARY KEY,
  client_schema VARCHAR(63) NOT NULL,
  admin_user_id CHAR(36) NOT NULL,
  change_type ENUM('PURCHASE', 'CONSUMPTION', 'REFUND', 'MANUAL_ADJUSTMENT') NOT NULL,
  interview_credits_change INT DEFAULT 0,
  position_credits_change INT DEFAULT 0,
  screening_credits_change INT DEFAULT 0,
  interview_credits_before INT DEFAULT 0,
  interview_credits_after INT DEFAULT 0,
  position_credits_before INT DEFAULT 0,
  position_credits_after INT DEFAULT 0,
  screening_credits_before INT DEFAULT 0,
  screening_credits_after INT DEFAULT 0,
  reference_type VARCHAR(50),
  reference_id VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
