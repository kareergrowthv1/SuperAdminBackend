-- Update payments table with missing columns for Candidate support
ALTER TABLE payments ADD COLUMN user_type ENUM('ADMIN', 'CANDIDATE') DEFAULT 'ADMIN' AFTER admin_email;
ALTER TABLE payments ADD COLUMN plan_id VARCHAR(36) AFTER user_type;
ALTER TABLE payments ADD COLUMN is_active TINYINT(1) DEFAULT 0 AFTER payment_status;
ALTER TABLE payments ADD COLUMN valid_till DATE AFTER is_active;
