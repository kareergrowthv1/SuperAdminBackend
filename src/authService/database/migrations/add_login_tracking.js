/**
 * Migration Script: Add login tracking columns to auth_db.users
 * 
 * Adds last_login_device and last_login_system columns for login audit tracking
 * 
 * Usage:
 *   node scripts/add_login_tracking.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const AUTH_DB_CONFIG = {
    host: process.env.AUTH_DB_HOST || 'localhost',
    user: process.env.AUTH_DB_USER || 'root',
    password: process.env.AUTH_DB_PASSWORD || '',
    database: 'auth_db',
    port: process.env.AUTH_DB_PORT || 3306,
};

async function addLoginTracking() {
    let connection;
    
    try {
        console.log('[Migration] Connecting to auth_db...');
        connection = await mysql.createConnection(AUTH_DB_CONFIG);
        
        console.log('[Migration] Connected to database');
        
        // Check if columns already exist
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'auth_db' 
            AND TABLE_NAME = 'users' 
            AND COLUMN_NAME IN ('last_login_device', 'last_login_system')
        `);
        
        const existingColumns = columns.map(c => c.COLUMN_NAME);
        
        // Add last_login_device if doesn't exist
        if (!existingColumns.includes('last_login_device')) {
            console.log('[Migration] Adding column last_login_device...');
            await connection.query(`
                ALTER TABLE users 
                ADD COLUMN last_login_device VARCHAR(255) COMMENT 'Device name parsed from user agent' 
                AFTER last_login_ip
            `);
            console.log('[Migration] ✓ Added last_login_device');
        } else {
            console.log('[Migration] ⊘ Column last_login_device already exists');
        }
        
        // Add last_login_system if doesn't exist
        if (!existingColumns.includes('last_login_system')) {
            console.log('[Migration] Adding column last_login_system...');
            await connection.query(`
                ALTER TABLE users 
                ADD COLUMN last_login_system VARCHAR(255) COMMENT 'System/Device identifier sent by client' 
                AFTER last_login_device
            `);
            console.log('[Migration] ✓ Added last_login_system');
        } else {
            console.log('[Migration] ⊘ Column last_login_system already exists');
        }
        
        console.log('[Migration] ✓ Migration completed successfully');
        
    } catch (error) {
        console.error('[Migration] Error:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('[Migration] Database connection closed');
        }
    }
}

// Run migration
addLoginTracking()
    .then(() => {
        console.log('[Migration] Script execution completed');
        process.exit(0);
    })
    .catch(err => {
        console.error('[Migration] Script failed:', err);
        process.exit(1);
    });
