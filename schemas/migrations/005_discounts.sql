-- Create discount_groups and discount_coupons tables
CREATE TABLE IF NOT EXISTS discount_groups (
  id VARCHAR(50) NOT NULL PRIMARY KEY,
  expires_at DATETIME,
  for_candidates TINYINT(1) DEFAULT 1,
  for_admins TINYINT(1) DEFAULT 0,
  total_limit INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discount_coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id VARCHAR(50) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  percentage DECIMAL(5, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES discount_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
