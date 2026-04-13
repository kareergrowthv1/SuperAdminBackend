-- Create report_analysis_levels table and seed data
CREATE TABLE IF NOT EXISTS report_analysis_levels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(50) NOT NULL UNIQUE,
  depth_score INT NOT NULL,
  description TEXT,
  is_active TINYINT(1) DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO report_analysis_levels (label, depth_score, description) VALUES
('none', 0, 'No AI report generation permitted'),
('min', 10, 'Minimal AI summary (Basic insights)'),
('standard', 50, 'Standard AI analysis (Detailed breakdown)'),
('complete', 100, 'Comprehensive AI audit (Deep-dive analysis)');
