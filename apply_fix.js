const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const config = require('./src/config');

async function applyMigrations() {
    const pool = mysql.createPool({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.name,
        multipleStatements: true
    });

    try {
        const conn = await pool.getConnection();
        console.log('Connected to database:', config.database.name);

        const migrationFiles = [
            '001_initial_schema.sql',
            '002_candidate_plans.sql',
            '003_report_analysis_levels.sql',
            '004_credits_history.sql',
            '005_discounts.sql',
            '006_payments_update.sql'
        ];

        for (const file of migrationFiles) {
            const filePath = path.join(__dirname, 'schemas/migrations', file);
            if (fs.existsSync(filePath)) {
                console.log(`Applying migration: ${file}`);
                const sql = fs.readFileSync(filePath, 'utf8');
                const statements = sql.split(';').filter(s => s.trim());
                for (const statement of statements) {
                    try {
                        await conn.query(statement);
                        console.log(`Success: ${statement.substring(0, 50)}...`);
                    } catch (err) {
                        console.log(`Skipped/Error: ${err.message}`);
                    }
                }
            } else {
                console.log(`Migration file not found: ${file}`);
            }
        }

        console.log('\nChecking critical columns in payments:');
        const [columns] = await conn.query("SHOW COLUMNS FROM payments WHERE Field IN ('valid_till', 'plan_id', 'is_active', 'user_type', 'payment_status')");
        console.table(columns);

        conn.release();
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

applyMigrations();
