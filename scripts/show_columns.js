const db = require('../src/config/db');
require('dotenv').config();

async function showColumns() {
    try {
        await db.initializePool();
        const result = await db.authQuery('SHOW COLUMNS FROM auth_db.users');
        console.table(result);
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        process.exit(0);
    }
}

showColumns();
