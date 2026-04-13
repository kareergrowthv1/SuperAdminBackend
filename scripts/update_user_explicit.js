const db = require('../src/config/db');

async function updateUser() {
    try {
        await db.initializePool();
        const userId = "62e66c61-cfe1-4ba5-8f87-da7d6df45e7e";
        const result = await db.authQuery('UPDATE auth_db.users SET is_college = false WHERE id = ?', [userId]);
        console.log('Update result:', result);
        
        const rows = await db.authQuery('SELECT id, is_college FROM auth_db.users WHERE id = ?', [userId]);
        console.log('After update:', rows[0]);
    } catch(e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
updateUser();
