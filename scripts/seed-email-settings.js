/**
 * Seed/update email (Zepto Mail) settings in superadmin_db from ref/backend_ai-main/config.py.
 * Run from SuperadminBackend: node scripts/seed-email-settings.js
 * Creates or updates settings.emailSettings so Superadmin UI and email senders use these values.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

// Zepto Mail API details – update apiKey/fromEmail as needed
const EMAIL_SETTINGS = {
  enabled: true,
  apiUrl: 'https://api.zeptomail.in/v1.1/email',
  apiKey: 'PHtE6r0IQOrvjGN88EJTsaS6FpT1ZootrONmfwNH5YtCWPYATU1Vrtsrkz/mr0h8APgTHPObyIJv47rNtL+CdjnkPWpKDWqyqK3sx/VYSPOZsbq6x00atVobd0fVVIHoc9Fs1CTWuNjTNA==',
  fromEmail: 'noreply@systemmindz.com',
  fromName: 'KareerGrowth'
};

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'superadmin_db',
    waitForConnections: true,
    connectionLimit: 2,
  });

  try {
    const conn = await pool.getConnection();
    try {
      const value = JSON.stringify(EMAIL_SETTINGS);
      await conn.execute(
        `INSERT INTO settings (\`key\`, \`value\`) VALUES ('emailSettings', ?)
         ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = CURRENT_TIMESTAMP`,
        [value]
      );
      console.log('emailSettings updated successfully in superadmin_db.settings.');
      console.log('Values: apiUrl=%s, fromEmail=%s, fromName=%s, enabled=%s', EMAIL_SETTINGS.apiUrl, EMAIL_SETTINGS.fromEmail, EMAIL_SETTINGS.fromName, EMAIL_SETTINGS.enabled);
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Failed to update email settings:', err.message);
    if (err.code === 'ER_NO_SUCH_TABLE') {
      console.error('Ensure superadmin_db and settings table exist. Run app once or apply SuperadminBackend/schemas/superadmin_schema.sql');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
