/**
 * One-time script: update ai_config row (id=1) in superadmin_db with OPENAI_API_KEY from .env.
 * Run from SuperadminBackend directory: node scripts/seed-ai-config-key.js
 * Ensure OPENAI_API_KEY is set in SuperadminBackend/.env (copy from ref/backend_ai-main/.env if needed).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function run() {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey.trim()) {
    console.error('OPENAI_API_KEY is not set in SuperadminBackend/.env. Add it and run again.');
    process.exit(1);
  }

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
      await conn.execute(
        `INSERT INTO ai_config (id, provider, api_key, base_url, model, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, stream, timeout, chunk_size, retry_on_timeout, max_retries)
         VALUES (1, 'OPENAI', ?, 'https://api.openai.com/v1', 'gpt-3.5-turbo', 0.70, 1024, 1.00, 0.00, 0.00, 1, 300, 1024, 1, 3)
         ON DUPLICATE KEY UPDATE
         api_key = VALUES(api_key),
         base_url = VALUES(base_url),
         model = VALUES(model),
         updated_at = CURRENT_TIMESTAMP`
      , [apiKey.trim()]);
      console.log('ai_config updated successfully. API key is now stored in superadmin_db.ai_config (id=1).');
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Failed to update ai_config:', err.message);
    if (err.code === 'ER_NO_SUCH_TABLE') {
      console.error('Run the ai_config migration first: SuperadminBackend/schemas/migrations/001_add_ai_config.sql');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
