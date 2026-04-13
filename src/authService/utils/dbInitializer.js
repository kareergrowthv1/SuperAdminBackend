// Database Initializer - Create tables and seed data
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('./logger');

const stripComments = (sql) => {
    const withoutBlock = sql.replace(/\/\*[\s\S]*?\*\//g, '');
    return withoutBlock.replace(/--.*$/gm, '');
};

const splitStatements = (sql) => {
    return sql
        .split(/;\s*(?:\r?\n|$)/)
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0);
};

const executeStatements = async (connection, statements, options = {}) => {
    const { continueOnError = false, label = 'SQL' } = options;

    for (const statement of statements) {
        const upper = statement.toUpperCase();
        if (upper.startsWith('SELECT ')) {
            continue;
        }

        try {
            await connection.query(statement);
        } catch (error) {
            if (!continueOnError) {
                throw error;
            }
            logger.warn(`${label} statement skipped`, { error: error.message });
        }
    }
};

const seedSystemData = async (connection) => {
    try {
        logger.info('Starting dynamic system data seeding...');

        // 1. Create Platform Organization
        const orgId = uuidv4();
        await connection.query(
            `INSERT INTO organizations (id, name, description, subscription_tier, is_active, metadata, created_at)
             VALUES (?, 'KareerGrowth', 'KareerGrowth ATS Platform', 'ENTERPRISE', true, 
             '{"maxUsers": -1, "customBranding": true, "sso": true, "aiEnabled": true}', NOW())
             ON DUPLICATE KEY UPDATE name = name`,
            [orgId]
        );

        // Get actual orgId (in case it already existed)
        const [orgs] = await connection.query("SELECT id FROM organizations WHERE name = 'KareerGrowth'");
        const finalOrgId = orgs[0].id;

        // 2. Create System Roles
        const roles = [
            { code: 'SUPERADMIN', name: 'Super Administrator' },
            { code: 'ADMIN', name: 'Administrator' },
            { code: 'ATS', name: 'Recruiter' },
            { code: 'CANDIDATE', name: 'Candidate' }
        ];

        for (const role of roles) {
            await connection.query(
                `INSERT INTO roles (id, organization_id, code, name, is_system, version, is_active, created_at)
                 VALUES (?, ?, ?, ?, true, 1, true, NOW())
                 ON DUPLICATE KEY UPDATE code = code`,
                [uuidv4(), finalOrgId, role.code, role.name]
            );
        }

        // 2b. Global CANDIDATE role (organization_id NULL) – for candidate portal only; never used for ADMIN/ATS
        await connection.query(
            `INSERT INTO roles (id, organization_id, code, name, is_system, version, is_active, created_at)
             VALUES (?, NULL, 'CANDIDATE', 'Candidate', true, 1, true, NOW())
             ON DUPLICATE KEY UPDATE code = code`,
            [uuidv4()]
        );

        // 3. Create Features
        const features = [
            // Core features (Common to both College and ATS)
            { key: 'DASHBOARD', name: 'DASHBOARD', cat: 'CORE', uri: '/dashboard/**', order: 1 },
            { key: 'USERS', name: 'USERS', cat: 'ADMIN', uri: '/users/**', order: 2 },
            { key: 'ROLES', name: 'ROLES', cat: 'ADMIN', uri: '/roles/**', order: 3 },
            { key: 'CANDIDATES', name: 'CANDIDATES', cat: 'CORE', uri: '/candidates/**', order: 4 },
            { key: 'INTERVIEWS', name: 'INTERVIEWS', cat: 'CORE', uri: '/interviews/**', order: 5 },
            { key: 'AI_TESTS', name: 'AI_TESTS', cat: 'CORE', uri: '/ai-tests/**', order: 6 },
            { key: 'REPORTS', name: 'REPORTS', cat: 'ANALYTICS', uri: '/reports/**', order: 7 },
            { key: 'AUDIT_LOGS', name: 'AUDIT_LOGS', cat: 'SECURITY', uri: '/audit-logs/**', order: 8 },
            
            // College-specific features
            { key: 'POSITIONS', name: 'POSITIONS', cat: 'COLLEGE', uri: '/positions/**', order: 9 },
            { key: 'INTEGRATION', name: 'INTEGRATION', cat: 'COLLEGE', uri: '/integration/**', order: 10 },
            
            // ATS-specific features
            { key: 'JOBS', name: 'JOBS', cat: 'ATS', uri: '/jobs/**', order: 11 },
            { key: 'CLIENTS', name: 'CLIENTS', cat: 'ATS', uri: '/clients/**', order: 12 },
            { key: 'VENDORS', name: 'VENDORS', cat: 'ATS', uri: '/vendors/**', order: 13 },
            { key: 'APPLICATIONS', name: 'APPLICATIONS', cat: 'ATS', uri: '/applications/**', order: 14 }
        ];

        for (const f of features) {
            await connection.query(
                `INSERT INTO features (id, name, feature_key, category, description, uri_pattern, display_order, is_system, is_active, requires_auth, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, true, true, true, NOW())
                 ON DUPLICATE KEY UPDATE feature_key = feature_key`,
                [uuidv4(), f.name, f.key, f.cat, f.name, f.uri, f.order]
            );
        }

        // 4. Assign Permissions
        const [superadminRole] = await connection.query("SELECT id FROM roles WHERE code = 'SUPERADMIN'");
        const [adminRole] = await connection.query("SELECT id FROM roles WHERE code = 'ADMIN'");
        const [atsRole] = await connection.query("SELECT id FROM roles WHERE code = 'ATS'");
        const [allFeatures] = await connection.query("SELECT id, feature_key FROM features");

        const defaultDashOptions = JSON.stringify({
            dashboard_page: true,
            positions_stats: true,
            candidates_stats: true,
            students_stats: true,
            users_stats: true,
            attendance_stats: true,
            tasks_stats: true,
            new_position_btn: true,
            add_candidate_btn: true,
            analytics_chart: true,
            activity_feed: true,
            volume_chart: true,
            performance_radar: true,
            recent_positions: true,
            recent_students: true,
            recent_interviews: true,
            recent_tasks: true
        });

        if (superadminRole[0]) {
            for (const f of allFeatures) {
                const dashOpts = f.feature_key === 'DASHBOARD' ? defaultDashOptions : null;
                // SUPERADMIN gets 255 and ALL scope
                await connection.query(
                    `INSERT INTO role_feature_permissions (id, role_id, feature_id, permissions, data_scope, dashboard_options, created_at)
                     VALUES (?, ?, ?, 255, 'ALL', ?, NOW())
                     ON DUPLICATE KEY UPDATE permissions = 255, data_scope = 'ALL', dashboard_options = VALUES(dashboard_options)`,
                    [uuidv4(), superadminRole[0].id, f.id, dashOpts]
                );
            }
        }

        const crudExportPermissions = 31;

        // ADMIN role (College) - Exclude ATS-specific features
        if (adminRole[0]) {
            for (const f of allFeatures) {
                // Skip ATS-only features for College role
                if (f.feature_key === 'JOBS' || f.feature_key === 'CLIENTS' || 
                    f.feature_key === 'VENDORS' || f.feature_key === 'APPLICATIONS') {
                    continue;
                }
                const dashOpts = f.feature_key === 'DASHBOARD' ? defaultDashOptions : null;
                await connection.query(
                    `INSERT INTO role_feature_permissions (id, role_id, feature_id, permissions, data_scope, dashboard_options, created_at)
                     VALUES (?, ?, ?, ?, 'ALL', ?, NOW())
                     ON DUPLICATE KEY UPDATE permissions = VALUES(permissions), data_scope = 'ALL', dashboard_options = VALUES(dashboard_options)`,
                    [uuidv4(), adminRole[0].id, f.id, crudExportPermissions, dashOpts]
                );
            }
        }

        // ATS role (Recruiter) - Exclude College-specific features
        if (atsRole[0]) {
            for (const f of allFeatures) {
                // Skip College-only features for ATS role
                if (f.feature_key === 'POSITIONS' || f.feature_key === 'INTEGRATION') {
                    continue;
                }
                await connection.query(
                    `INSERT INTO role_feature_permissions (id, role_id, feature_id, permissions, created_at)
                     VALUES (?, ?, ?, ?, NOW())
                     ON DUPLICATE KEY UPDATE permissions = VALUES(permissions)`,
                    [uuidv4(), atsRole[0].id, f.id, crudExportPermissions]
                );
            }
        }

        logger.info('✓ System metadata seeded successfully');
    } catch (error) {
        logger.error('Failed to seed system data', { error: error.message });
    }
};

const seedUsersFromEnv = async (connection) => {
    // Seed SUPERADMIN user - hardcoded credentials
    const email = 'superadmin@exe.in';
    const username = 'superadmin';
    const password = 'Admin@123';

    // Look up dynamic IDs
    const [roles] = await connection.query("SELECT id FROM roles WHERE code = 'SUPERADMIN' LIMIT 1");
    if (roles.length === 0) {
        logger.warn('Skipping user seeding: SUPERADMIN role not found');
        return;
    }
    const superadminRoleId = roles[0].id;

    const [orgs] = await connection.query("SELECT id FROM organizations WHERE name = 'KareerGrowth' LIMIT 1");
    if (orgs.length === 0) {
        logger.warn('Skipping user seeding: KareerGrowth org not found');
        return;
    }
    const kareerGrowthOrgId = orgs[0].id;

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    try {
        await connection.query(
            `INSERT INTO users (
                id, organization_id, email, username, password_hash, first_name, last_name,
                email_verified, enabled, is_active, is_admin, is_platform_admin,
                account_expired, account_locked, credentials_expired,
                password_reset_required, failed_login_count, two_factor_enabled,
                is_college, role_id, created_at, updated_at, login_attempts_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)
            ON DUPLICATE KEY UPDATE 
                email = VALUES(email),
                password_hash = VALUES(password_hash),
                updated_at = NOW()`,
            [
                uuidv4(),
                kareerGrowthOrgId,
                email,
                username,
                passwordHash,
                'Super',
                'Admin',
                true,
                true,
                true,
                true,
                false,
                false,
                false,
                false,
                false,
                0,
                false,
                0,
                superadminRoleId,
                0
            ]
        );
        logger.info('✓ Superadmin user seeded', { email });
    } catch (error) {
        logger.error('Failed to seed superadmin user', { error: error.message });
    }
};

const runMigrations = async (connection) => {
    // Helper: add a column if it doesn't already exist
    const addColumnIfMissing = async (table, column, definition) => {
        const [rows] = await connection.query(
            `SELECT COUNT(*) AS cnt
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
            [table, column]
        );
        if (rows[0].cnt === 0) {
            await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
            logger.info(`✓ Added column ${table}.${column}`);
        }
    };

    try {
        // Add is_subscribed column if not exists
        await addColumnIfMissing('users', 'is_subscribed', 'TINYINT(1) NOT NULL DEFAULT 0');
        // Add is_hold column if not exists
        await addColumnIfMissing('users', 'is_hold', 'TINYINT(1) NOT NULL DEFAULT 0');
        // Add is_college column if not exists
        await addColumnIfMissing('users', 'is_college', "TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'true if ADMIN role (College), false if ATS role'");
        // Add last_login_device column if not exists
        await addColumnIfMissing('users', 'last_login_device', 'VARCHAR(100) NULL');

        // Add data_scope column to role_feature_permissions if not exists
        await addColumnIfMissing('role_feature_permissions', 'data_scope', "VARCHAR(20) DEFAULT 'OWN'");
        // Add dashboard_options column to role_feature_permissions if not exists
        await addColumnIfMissing('role_feature_permissions', 'dashboard_options', 'JSON NULL');

        logger.info('✓ User table migrations applied');
    } catch (err) {
        logger.error('Migration failed', { error: err.message });
        throw err;
    }
};

const updateExistingUserRoles = async (connection) => {
    try {
        // Update is_college based on role code
        // Set is_college=1 for ADMIN role (College), is_college=0 for ATS role
        await connection.query(
            `UPDATE users u
             INNER JOIN roles r ON u.role_id = r.id
             SET u.is_college = CASE 
                WHEN r.code = 'ADMIN' THEN 1
                WHEN r.code = 'ATS' THEN 0
                ELSE 1
             END
             WHERE u.deleted_at IS NULL`
        );
        logger.info('✓ Updated existing users with is_college based on roles');
    } catch (error) {
        logger.error('Failed to update user roles', { error: error.message });
    }
};

const initializeDatabase = async () => {
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');

    if (!fs.existsSync(schemaPath)) {
        logger.warn('Schema file not found, skipping DB initialization', { schemaPath });
        return;
    }

    const rawSql = fs.readFileSync(schemaPath, 'utf8');
    let cleanedSql = stripComments(rawSql);
    cleanedSql = cleanedSql.replace(
        /,\s*ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci\s*\)\s*COMMENT='([^']*)';/g,
        ") ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='$1';"
    );
    cleanedSql = cleanedSql.replace(
        /,\s*ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci\s*\)\s*;/g,
        ") ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    );

    const statements = splitStatements(cleanedSql);

    const connection = await db.getPool().getConnection();
    try {
        await executeStatements(connection, statements, { label: 'Schema' });
        await runMigrations(connection);
        await updateExistingUserRoles(connection);
        await seedSystemData(connection);
        await seedUsersFromEnv(connection);

        logger.info('✓ Database schema initialized and seed data ensured');
    } catch (error) {
        logger.error('Database initialization failed', { error: error.message });
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = {
    initializeDatabase
};
