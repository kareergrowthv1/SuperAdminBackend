const db = require('../src/config/db');
require('dotenv').config();

async function fixUser() {
    try {
        await db.initializePool();
        const userId = "62e66c61-cfe1-4ba5-8f87-da7d6df45e7e";
        console.log(`Updating is_college to false for user ${userId}`);
        const result = await db.authQuery('UPDATE auth_db.users SET is_college = 0 WHERE id = ?', [userId]);
        console.log("Update result:", result.affectedRows > 0 ? "Success" : "No rows affected");
    } catch (err) {
        console.error('Error updating user:', err.message);
    } finally {
        process.exit(0);
    }
}

fixUser();
