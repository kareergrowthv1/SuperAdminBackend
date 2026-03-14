-- ============================================================
-- KareerGrowth ATS - AuthService Database Schema - MySQL 8.x
-- Database: auth_db
-- Version: 2.0
-- Created: February 2026
-- ============================================================

-- Create Database
CREATE DATABASE IF NOT EXISTS auth_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE auth_db;

-- ============================================================
-- 1. Organizations Table
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID generated in application',
    name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(500),
    subscription_tier VARCHAR(50) NOT NULL DEFAULT 'BASIC' COMMENT 'BASIC, PROFESSIONAL, ENTERPRISE',
    
    -- Soft deletion
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Metadata - JSON for additional configuration
    metadata JSON COMMENT 'e.g., {"maxUsers": 100, "customBranding": true, "sso": false}',
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    -- Indexes for query optimization
    INDEX idx_orgs_name (name)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Organization/Tenant master table';

-- ============================================================
-- 2. Roles Table (with Role Versioning)
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID generated in application',
    organization_id CHAR(36) NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    is_system BOOLEAN DEFAULT false COMMENT 'System roles cannot be modified',
    
    -- Role Versioning: Increments when permissions change
    version INTEGER NOT NULL DEFAULT 1 COMMENT 'When version changes, all tokens with old version become invalid',
    
    -- Soft deletion
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    -- Constraints
    UNIQUE KEY uk_roles_org_code (organization_id, code),
    UNIQUE KEY uk_roles_org_name (organization_id, name),
    
    -- Indexes for query optimization
    INDEX idx_roles_org_active (organization_id, is_active),
    INDEX idx_roles_code (code),
    INDEX idx_roles_version (version),
    
    -- Foreign key constraint
    CONSTRAINT fk_roles_org FOREIGN KEY (organization_id) REFERENCES organizations(id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Roles with versioning for permission invalidation';

-- ============================================================
-- 3. Users Table
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID generated in application',
    organization_id CHAR(36) NULL,
    email VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL COMMENT 'Bcrypt hashed',
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone_number VARCHAR(20),
    email_verified BOOLEAN DEFAULT false,
    mobile_no VARCHAR(20),
    client VARCHAR(100),
    
    -- Status Flags
    enabled BOOLEAN DEFAULT true,
    subscription BOOLEAN DEFAULT false,
    is_subscribed TINYINT(1) NOT NULL DEFAULT 0,
    is_hold TINYINT(1) NOT NULL DEFAULT 0,
    is_college TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'true if ADMIN role (College), false if ATS role',
    is_active BOOLEAN DEFAULT true COMMENT 'Soft deletion flag',
    is_admin BOOLEAN DEFAULT false,
    is_platform_admin BOOLEAN DEFAULT false,
    account_expired BOOLEAN DEFAULT false,
    account_locked BOOLEAN DEFAULT false,
    credentials_expired BOOLEAN DEFAULT false,
    password_reset_required BOOLEAN DEFAULT false,
    failed_login_count INTEGER DEFAULT 0,
    two_factor_enabled BOOLEAN DEFAULT false,
    
    -- Foreign Keys
    role_id CHAR(36) NOT NULL,
    
    -- Audit Fields
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL COMMENT 'Soft delete timestamp',
    expiry_date TIMESTAMP NULL,
    last_password_change_at TIMESTAMP NULL,
    created_by CHAR(36),
    updated_by CHAR(36),
    last_login_at TIMESTAMP NULL,
    last_login_ip VARCHAR(45) COMMENT 'IPv4 or IPv6',
    last_login_device VARCHAR(255) COMMENT 'Device name parsed from user agent',
    last_login_system VARCHAR(255) COMMENT 'System/Device identifier sent by client',
    login_attempts_count INTEGER DEFAULT 0,
    
    -- Unique constraint on email/username per organization
    UNIQUE KEY uk_users_email_org (organization_id, email),
    UNIQUE KEY uk_users_username_org (organization_id, username),
    
    -- Indexes
    INDEX idx_users_email (email),
    INDEX idx_users_org_active (organization_id, is_active),
    INDEX idx_users_org_email (organization_id, email),
    INDEX idx_users_role_id (role_id),
    INDEX idx_users_account_locked (account_locked),
    INDEX idx_users_expiry (expiry_date),
    
    -- Foreign key constraints
    CONSTRAINT fk_users_org FOREIGN KEY (organization_id) REFERENCES organizations(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Users table with multi-tenant support';

-- ============================================================
-- 4. Features Table
-- ============================================================
CREATE TABLE IF NOT EXISTS features (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID generated in application',
    name VARCHAR(100) NOT NULL COMMENT 'Global feature names',
    feature_key VARCHAR(100) NOT NULL COMMENT 'Stable unique key for features',
    parent_feature_id CHAR(36) NULL,
    category VARCHAR(50) NOT NULL,
    description VARCHAR(500),
    uri_pattern VARCHAR(255) NOT NULL,
    display_order INT DEFAULT 0,
    is_system BOOLEAN DEFAULT true,
    
    -- Feature toggle
    is_active BOOLEAN DEFAULT true,
    requires_auth BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    -- Indexes
    UNIQUE KEY uk_features_key (feature_key),
    UNIQUE KEY uk_features_name (name),
    INDEX idx_features_category (category),
    INDEX idx_features_active (is_active),
    INDEX idx_features_parent (parent_feature_id),
    
    -- Foreign key constraint (self-reference)
    CONSTRAINT fk_features_parent FOREIGN KEY (parent_feature_id) REFERENCES features(id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='System features/modules';

-- ============================================================
-- 5. Role Feature Permissions Table (Bitmap)
-- ============================================================
CREATE TABLE IF NOT EXISTS role_feature_permissions (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID generated in application',
    role_id CHAR(36) NOT NULL,
    feature_id CHAR(36) NOT NULL,
    
    -- Bitmap storage: 8 bits for 8 permission scopes
    -- READ=1, CREATE=2, UPDATE=4, DELETE=8, EXPORT=16, IMPORT=32, APPROVE=64, REJECT=128
    permissions INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Constraints & Indexes
    UNIQUE KEY uk_rfp_role_feature (role_id, feature_id),
    INDEX idx_rfp_role_id (role_id),
    INDEX idx_rfp_feature_id (feature_id),
    
    -- Foreign key constraints
    CONSTRAINT fk_rfp_role FOREIGN KEY (role_id) REFERENCES roles(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_rfp_feature FOREIGN KEY (feature_id) REFERENCES features(id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Role permissions using bitmap for efficient storage';

-- ============================================================
-- 6. Organization Features Table (Feature Flags)
-- ============================================================
CREATE TABLE IF NOT EXISTS organization_features (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID generated in application',
    organization_id CHAR(36) NOT NULL,
    feature_key VARCHAR(100) NOT NULL COMMENT 'e.g., ATS, AI_TESTING, PROCTORING',
    feature_name VARCHAR(255) NOT NULL,
    description VARCHAR(500),
    
    -- Feature enablement
    is_enabled BOOLEAN DEFAULT false,
    
    -- Configuration for this feature
    config JSON COMMENT 'e.g., {"maxPositions": 50, "enableAnalytics": true}',
    
    -- Soft deletion
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    -- Constraints & Indexes
    UNIQUE KEY uk_org_feature_key (organization_id, feature_key),
    INDEX idx_org_features_org_enabled (organization_id, is_enabled),
    INDEX idx_org_features (organization_id, feature_key),
    
    -- Foreign key constraint
    CONSTRAINT fk_org_features_org FOREIGN KEY (organization_id) REFERENCES organizations(id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Organization-level feature flags';

-- ============================================================
-- 7. Refresh Tokens Table
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID generated in application',
    user_id CHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE COMMENT 'SHA-256 hash of refresh token',
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    INDEX idx_refresh_user (user_id),
    INDEX idx_refresh_expires (expires_at),
    INDEX idx_refresh_revoked (revoked),

    -- Foreign key constraint
    CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Refresh tokens for session management';

-- ============================================================
-- 8. Audit Logs Table
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID generated in application',
    organization_id CHAR(36) NOT NULL,
    user_id CHAR(36) COMMENT 'NULL for system actions',
    
    -- Action details
    action VARCHAR(50) NOT NULL COMMENT 'e.g., CREATE, UPDATE, DELETE, LOGIN, LOGOUT',
    resource_type VARCHAR(50) COMMENT 'e.g., USER, JOB, CANDIDATE, ROLE',
    resource_id CHAR(36) COMMENT 'ID of affected resource',
    
    -- Change details
    old_values JSON COMMENT 'Previous values of modified fields',
    new_values JSON COMMENT 'New values of modified fields',
    
    -- Context
    ip_address VARCHAR(45) COMMENT 'IPv4 or IPv6',
    user_agent TEXT,
    request_id VARCHAR(255) COMMENT 'For tracing correlation',
    
    -- Status & error tracking
    status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' COMMENT 'SUCCESS or FAILURE',
    error_message TEXT,
    
    -- Timestamp
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for queries
    INDEX idx_audit_org (organization_id),
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_resource (resource_type, resource_id),
    INDEX idx_audit_action (action),
    INDEX idx_audit_created (created_at DESC),
    INDEX idx_audit_composite (organization_id, created_at DESC),
    INDEX idx_audit_org_created (organization_id, created_at),
    INDEX idx_audit_user_created (user_id, created_at),
    
    -- Foreign key constraint
    CONSTRAINT fk_audit_org FOREIGN KEY (organization_id) REFERENCES organizations(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='System audit logs for tracking actions';

-- ============================================================
-- 8. Login Attempts Table
-- ============================================================
CREATE TABLE IF NOT EXISTS login_attempts (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID generated in application',
    organization_id CHAR(36) NOT NULL,
    user_id CHAR(36),
    email VARCHAR(255) NOT NULL,
    
    -- Attempt details
    attempt_count INTEGER NOT NULL DEFAULT 1,
    is_locked BOOLEAN DEFAULT false,
    
    -- Timing
    first_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    locked_until TIMESTAMP NULL COMMENT 'When lock expires',
    
    -- Context
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Soft deletion
    cleared_at TIMESTAMP NULL COMMENT 'When manually reset by admin',
    
    -- Cleanup (auto-expire after lock duration)
    expires_at TIMESTAMP,
    
    -- Indexes
    INDEX idx_login_attempts_email (email),
    INDEX idx_login_attempts_org_email (organization_id, email),
    INDEX idx_login_attempts_org (organization_id),
    INDEX idx_login_attempts_user (user_id),
    INDEX idx_login_attempts_locked_until (locked_until),
    INDEX idx_login_attempts_expires (expires_at),
    
    -- Foreign key constraint
    CONSTRAINT fk_login_attempts_org FOREIGN KEY (organization_id) REFERENCES organizations(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_login_attempts_user FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Login attempt tracking for security';

-- ============================================================
-- 9. Candidate Login Table (candidate portal only; separate from users)
-- ============================================================
CREATE TABLE IF NOT EXISTS candidate_login (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID generated in application',
    email VARCHAR(255) NULL COMMENT 'Candidate email; NULL if registered with mobile only',
    mobile_number VARCHAR(20) NULL COMMENT 'Candidate mobile; NULL if registered with email only',
    password_hash VARCHAR(255) NOT NULL COMMENT 'Bcrypt hashed',
    name VARCHAR(255) NOT NULL COMMENT 'Full name',
    
    -- Optional organization binding (e.g. default org for candidate portal)
    organization_id CHAR(36) NULL,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL,
    last_login_ip VARCHAR(45),
    
    -- Indexes for lookup by email or mobile
    UNIQUE KEY uk_candidate_login_email (email),
    UNIQUE KEY uk_candidate_login_mobile (mobile_number),
    INDEX idx_candidate_login_email (email),
    INDEX idx_candidate_login_mobile (mobile_number),
    INDEX idx_candidate_login_org (organization_id)
) ENGINE=INNODB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Candidate portal logins; separate from users table';

-- ============================================================
-- 10. Candidate Refresh Tokens Table
-- ============================================================
CREATE TABLE IF NOT EXISTS candidate_refresh_tokens (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID generated in application',
    candidate_id CHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE COMMENT 'SHA-256 hash of refresh token',
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_candidate_refresh_candidate (candidate_id),
    INDEX idx_candidate_refresh_expires (expires_at),
    INDEX idx_candidate_refresh_revoked (revoked),

    CONSTRAINT fk_candidate_refresh_candidate FOREIGN KEY (candidate_id) REFERENCES candidate_login(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=INNODB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Refresh tokens for candidate portal sessions';

-- ============================================================
-- 11. XSRF Tokens Table
-- ============================================================
CREATE TABLE IF NOT EXISTS xsrf_tokens (
    id CHAR(36) PRIMARY KEY COMMENT 'UUID generated in application',
    user_id CHAR(36) COMMENT 'NULL for unauthenticated sessions',
    organization_id CHAR(36),
    
    -- Token
    token_hash VARCHAR(255) NOT NULL UNIQUE COMMENT 'SHA-256 hash',
    
    -- Binding
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    
    -- Metadata
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT false,
    used_at TIMESTAMP NULL,
    
    -- Context
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Indexes
    INDEX idx_xsrf_exp (expires_at),
    INDEX idx_xsrf_session (session_id),
    INDEX idx_xsrf_user (user_id),
    
    -- Foreign key constraints
    CONSTRAINT fk_xsrf_user FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_xsrf_org FOREIGN KEY (organization_id) REFERENCES organizations(id) 
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='XSRF token storage for double-submit cookie strategy';

-- ============================================================
-- End of Schema - KareerGrowth ATS
-- ============================================================
