const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const SCHEMA_PATH = path.join(__dirname, '../../schemas/superadmin_schema.sql');
const AUTH_SCHEMA_PATH = path.join(__dirname, '../authService/database/schema.sql');

const createSuperadminDatabase = async () => {
    const tempPool = mysql.createPool({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        waitForConnections: true,
        connectionLimit: 1,
        queueLimit: 0
    });

    try {
        const conn = await tempPool.getConnection();

        console.log('[InitDB] Creating superadmin_db database...');
        await conn.query(
            `CREATE DATABASE IF NOT EXISTS \`${config.database.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        console.log('[InitDB] ✓ Database created/verified');

        conn.release();
    } finally {
        await tempPool.end();
    }
};

const executeSchemaSql = async () => {
    if (!fs.existsSync(SCHEMA_PATH)) {
        console.warn(`[InitDB] Schema file not found: ${SCHEMA_PATH}`);
        return;
    }

    const pool = mysql.createPool({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.name,
        waitForConnections: true,
        connectionLimit: 1,
        queueLimit: 0,
        charset: 'utf8mb4',
        timezone: '+00:00',
        multipleStatements: true
    });

    try {
        const conn = await pool.getConnection();

        console.log('[InitDB] Reading schema file...');
        const rawSql = fs.readFileSync(SCHEMA_PATH, 'utf8');

        // Remove comments and split by semicolon
        const statements = rawSql
            .split('\n')
            .filter(line => !line.trim().startsWith('--') && line.trim().length > 0)
            .join('\n')
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('USE ') && !s.startsWith('CREATE DATABASE'));

        console.log(`[InitDB] Executing ${statements.length} SQL statements...`);

        for (const statement of statements) {
            if (statement.trim()) {
                await conn.query(statement);
            }
        }

        console.log('[InitDB] ✓ Schema initialized successfully');
        conn.release();
    } finally {
        await pool.end();
    }
};

const createAuthDatabase = async () => {
    const tempPool = mysql.createPool({
        host: config.authDatabase.host,
        port: config.authDatabase.port,
        user: config.authDatabase.user,
        password: config.authDatabase.password,
        waitForConnections: true,
        connectionLimit: 1,
        queueLimit: 0
    });

    try {
        const conn = await tempPool.getConnection();

        console.log('[InitDB] Creating auth_db database...');
        await conn.query(
            `CREATE DATABASE IF NOT EXISTS \`${config.authDatabase.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        console.log('[InitDB] ✓ auth_db database created/verified');

        conn.release();
    } finally {
        await tempPool.end();
    }
};

const executeAuthSchemaSql = async () => {
    if (!fs.existsSync(AUTH_SCHEMA_PATH)) {
        console.warn(`[InitDB] auth_db schema file not found: ${AUTH_SCHEMA_PATH}`);
        return;
    }

    const pool = mysql.createPool({
        host: config.authDatabase.host,
        port: config.authDatabase.port,
        user: config.authDatabase.user,
        password: config.authDatabase.password,
        database: config.authDatabase.name,
        waitForConnections: true,
        connectionLimit: 1,
        queueLimit: 0,
        charset: 'utf8mb4',
        timezone: '+00:00',
        multipleStatements: true
    });

    try {
        const conn = await pool.getConnection();

        console.log('[InitDB] Reading auth_db schema file...');
        const rawSql = fs.readFileSync(AUTH_SCHEMA_PATH, 'utf8');

        // Split by semicolon and filter out USE/CREATE DATABASE
        const statements = rawSql
            .split('\n')
            .filter(line => !line.trim().startsWith('--') && line.trim().length > 0)
            .join('\n')
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('USE ') && !s.startsWith('CREATE DATABASE'));

        console.log(`[InitDB] Executing ${statements.length} SQL statements for auth_db...`);

        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await conn.query(statement);
                } catch (err) {
                    console.error(`[InitDB] Error executing auth_db statement: ${statement.substring(0, 50)}...`);
                    console.error(`[InitDB] Error details: ${err.message}`);
                    // Continue with other statements
                }
            }
        }

        console.log('[InitDB] ✓ auth_db schema initialization attempt complete');
        conn.release();
    } catch (error) {
        console.error('[InitDB] Fatal error during auth_db schema execution:', error.message);
    } finally {
        await pool.end();
    }
};

/**
 * Run incremental column migrations that are safe to re-run on every start.
 * Uses INFORMATION_SCHEMA to detect missing columns before adding them.
 */
const runMigrations = async () => {
    const pool = mysql.createPool({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.name,
        waitForConnections: true,
        connectionLimit: 1,
        queueLimit: 0
    });

    try {
        const conn = await pool.getConnection();
        console.log('[InitDB] Running column migrations...');

        // Helper: add a column if it doesn't already exist
        const addColumnIfMissing = async (table, column, definition) => {
            const [rows] = await conn.query(
                `SELECT COUNT(*) AS cnt
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                [config.database.name, table, column]
            );
            if (rows[0].cnt === 0) {
                await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
                console.log(`[InitDB] ✓ Added column ${table}.${column}`);
            }
        };

        // payments table migrations
        await addColumnIfMissing('payments', 'invoice_number', 'VARCHAR(50) NULL DEFAULT NULL');
        await addColumnIfMissing('payments', 'manual_reference_number', 'VARCHAR(100) NULL DEFAULT NULL');
        await addColumnIfMissing('payments', 'received_by', 'VARCHAR(255) NULL DEFAULT NULL');
        await addColumnIfMissing('payments', 'payment_notes', 'TEXT NULL DEFAULT NULL');
        await addColumnIfMissing('payments', 'payment_proof_reference', 'VARCHAR(500) NULL DEFAULT NULL');
        await addColumnIfMissing('payments', 'payment_capture', 'TINYINT(1) NOT NULL DEFAULT 1');
        await addColumnIfMissing('payments', 'gateway_name', 'VARCHAR(50) NULL DEFAULT NULL');
        await addColumnIfMissing('payments', 'gateway_response', 'JSON NULL DEFAULT NULL');
        await addColumnIfMissing('payments', 'payment_date', 'DATETIME NULL DEFAULT NULL');
        await addColumnIfMissing('payments', 'refund_amount', 'DECIMAL(10,2) NULL DEFAULT NULL');
        await addColumnIfMissing('payments', 'refund_date', 'DATETIME NULL DEFAULT NULL');
        await addColumnIfMissing('payments', 'refund_id', 'VARCHAR(255) NULL DEFAULT NULL');
        await addColumnIfMissing('payments', 'validity_extended_days', 'INT NOT NULL DEFAULT 0');
        await addColumnIfMissing('payments', 'screening_credits_added', 'INT NOT NULL DEFAULT 0');
        await addColumnIfMissing('payments', 'subscription_id', 'BINARY(16) NULL DEFAULT NULL');

        // Ensure email (Zepto Mail) settings row exists (ref/backend_ai-main/config.py defaults)
        const defaultEmailSettings = JSON.stringify({
            enabled: true,
            apiUrl: 'https://api.zeptomail.in/v1.1/email',
            apiKey: 'PHtE6r1fEL/ojGYn8hRR4vS7H5T1MY8s+O4zKFROsd1GDPEHF01TqI8pmmO2qRZ8AKRBEPOdwYpvtemYte2AITzoY21MWmqyqK3sx/VYSPOZsbq6x00at1sddEXaXI7ucdJt3C3Tv9rcNA==',
            fromEmail: 'noreply@qwikhire.ai',
            fromName: 'KareerGrowth'
        });
        await conn.query(
            `INSERT IGNORE INTO settings (\`key\`, \`value\`) VALUES ('emailSettings', ?)`,
            [defaultEmailSettings]
        );

        // Ensure candidate_plans table exists (GET /superadmin/plans)
        const migrationPlansPath = path.join(__dirname, '../../schemas/migrations/002_candidate_plans.sql');
        if (fs.existsSync(migrationPlansPath)) {
            const planSql = fs
                .readFileSync(migrationPlansPath, 'utf8')
                .split('\n')
                .filter((l) => !l.trim().startsWith('--'))
                .join('\n')
                .trim()
                .replace(/;\s*$/, '');
            if (planSql) {
                await conn.query(planSql);
                console.log('[InitDB] ✓ candidate_plans table ensured');
            }
        }

        console.log('[InitDB] ✓ Column migrations complete');
        conn.release();
    } finally {
        await pool.end();
    }
};

const initializeSuperadminDB = async () => {
    try {
        console.log('[InitDB] Starting superadmin database initialization...');

        await createSuperadminDatabase();
        await executeSchemaSql();
        await runMigrations();   // ← safe column migration on every boot

        console.log('[InitDB] ✓ Superadmin database initialization complete');
        return true;
    } catch (error) {
        console.error('[InitDB] Error initializing superadmin database:', error);
        throw error;
    }
};

const runAuthMigrations = async () => {
    const pool = mysql.createPool({
        host: config.authDatabase.host,
        port: config.authDatabase.port,
        user: config.authDatabase.user,
        password: config.authDatabase.password,
        database: config.authDatabase.name,
        waitForConnections: true,
        connectionLimit: 1,
        queueLimit: 0
    });

    try {
        const conn = await pool.getConnection();
        console.log('[InitDB] Running auth_db column migrations...');

        const addColumnIfMissing = async (table, column, definition) => {
            const [rows] = await conn.query(
                `SELECT COUNT(*) AS cnt
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                [config.authDatabase.name, table, column]
            );
            if (rows[0].cnt === 0) {
                await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
                console.log(`[InitDB] ✓ Added column ${table}.${column} to auth_db`);
            }
        };

        await addColumnIfMissing('users', 'is_subscribed', 'TINYINT(1) NOT NULL DEFAULT 0');
        await addColumnIfMissing('users', 'is_hold', 'TINYINT(1) NOT NULL DEFAULT 0');

        console.log('[InitDB] ✓ auth_db column migrations complete');
        conn.release();
    } finally {
        await pool.end();
    }
};

const initializeAuthDB = async () => {
    try {
        console.log('[InitDB] Starting auth_db database initialization...');

        await createAuthDatabase();
        await executeAuthSchemaSql();
        await runAuthMigrations();

        console.log('[InitDB] ✓ auth_db database initialization complete');
        return true;
    } catch (error) {
        console.error('[InitDB] Error initializing auth_db database:', error);
        throw error;
    }
};

module.exports = {
    initializeSuperadminDB,
    initializeAuthDB
};
