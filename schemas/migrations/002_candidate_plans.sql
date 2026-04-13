-- Create candidate_plans table
CREATE TABLE IF NOT EXISTS candidate_plans (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  interview_credits INT DEFAULT 0,
  position_credits INT DEFAULT 0,
  price DECIMAL(10, 2) DEFAULT 0.00,
  duration_months INT DEFAULT 1,
  features JSON,
  best_for VARCHAR(255),
  credits_per_month INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  permissions JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Candidate Plans
INSERT IGNORE INTO candidate_plans (id, name, slug, description, price, credits_per_month, interview_credits, duration_months, best_for, sort_order, features) VALUES
('p1-free-trial', 'Free', 'free', 'Trial users - One time credits', 0.00, 10, 10, 1, 'Trial users', 1, '["1 Resume Score", "Basic HR Round access"]'),
('p2-basic-fresher', 'Basic', 'basic', 'Perfect for Freshers', 199.00, 100, 100, 1, 'Freshers', 2, '["2 Full Interviews", "1 Full + Resume + Reports", "3-4 HR/Position rounds"]'),
('p3-premium-serious', 'Premium', 'premium', 'For serious candidates', 499.00, 300, 300, 1, 'Serious candidates', 3, '["4-5 Full Interviews", "Multiple coding rounds + reports", "Full prep journey"]'),
('p4-pro-power', 'Pro', 'pro', 'Power users experience', 999.00, 800, 800, 1, 'Power users', 4, '["10-12 Full Interviews", "Heavy coding practice", "All features unlimited feel"]');
