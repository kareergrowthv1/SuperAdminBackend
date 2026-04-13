const db = require('../src/config/db');

async function test() {
    try {
        await db.initializePool();
        const userId = "62e66c61-cfe1-4ba5-8f87-da7d6df45e7e";
        const rows = await db.authQuery('SELECT id, email, is_college, client FROM auth_db.users WHERE id = ?', [userId]);
        console.log(rows[0]);
    } catch(e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();
