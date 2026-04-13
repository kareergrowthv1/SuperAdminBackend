const fs = require('fs');
const db = require('../src/config/db');

async function checkCredits() {
    try {
        await db.initializePool();
        const userId = "62e66c61-cfe1-4ba5-8f87-da7d6df45e7e";
        const users = await db.authQuery('SELECT client FROM auth_db.users WHERE id = ?', [userId]);
        const client = users[0].client;
        console.log('Client DB:', client);
        
        const q = `SELECT * FROM \`${client}\`.credits`;
        const res = await db.query(q);
        console.log('Credits:', res);
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit();
    }
}
checkCredits();
