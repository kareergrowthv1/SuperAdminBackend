/**
 * One-time test: send a test email using Zepto config from DB.
 * Usage: node scripts/test-email-send.js
 * Sends to sharan@qwikhire.ai
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const axios = require('axios');

const TO_EMAIL = 'sharan@qwikhire.ai';

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

  let config;
  try {
    const [rows] = await pool.query("SELECT `value` FROM settings WHERE `key` = 'emailSettings' LIMIT 1");
    await pool.end();
    if (!rows || rows.length === 0) {
      console.error('emailSettings not found in DB. Run seed-email-settings.js first.');
      process.exit(1);
    }
    config = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
  } catch (e) {
    console.error('Failed to read emailSettings:', e.message);
    process.exit(1);
  }

  if (!config.enabled || !config.apiKey || !config.fromEmail) {
    console.error('Email not enabled or missing apiKey/fromEmail in settings.');
    process.exit(1);
  }

  const apiUrl = (config.apiUrl || 'https://api.zeptomail.in/v1.1/email').trim();
  const fromName = (config.fromName || 'KareerGrowth').trim();

  const payload = {
    from: { address: config.fromEmail, name: fromName },
    to: [{ email_address: { address: TO_EMAIL, name: 'Sharan' } }],
    subject: 'Test Email',
    htmlbody: '<div><b>Test email sent successfully.</b></div>',
  };

  try {
    const res = await axios.post(apiUrl, payload, {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Zoho-enczapikey ${config.apiKey}`,
      },
    });
    console.log('Test email sent to', TO_EMAIL, '- status:', res.status);
  } catch (err) {
    console.error('Send failed:', err.response?.data || err.message);
    process.exit(1);
  }
}

run();
