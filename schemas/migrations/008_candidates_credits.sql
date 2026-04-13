-- Create candidates_credits table for tracking granular usage
CREATE TABLE IF NOT EXISTS candidates_credits (
  id CHAR(36) NOT NULL PRIMARY KEY,
  candidate_id VARCHAR(36) NOT NULL,
  service_type VARCHAR(50) NOT NULL COMMENT 'e.g., AI_MOCK, RESUME_ATS, TECH_CONCEPT',
  service_name VARCHAR(100) NOT NULL COMMENT 'e.g., Technical Round - 8 Min',
  credits_used INT NOT NULL DEFAULT 0,
  metadata JSON DEFAULT NULL COMMENT 'Additional details like duration, round type, etc.',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_candidate_id (candidate_id),
  INDEX idx_service_type (service_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
