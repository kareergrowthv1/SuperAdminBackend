const db = require('../src/config/db');
require('dotenv').config();

async function testRoles() {
    try {
        await db.initializePool();
        console.log("Verifying the new getSystemRoles query: SELECT id, code, name FROM auth_db.roles WHERE is_system = 1 AND LOWER(name) NOT LIKE '%candidate%'");
        const roles = await db.authQuery("SELECT id, code, name FROM auth_db.roles WHERE is_system = 1 AND LOWER(name) NOT LIKE '%candidate%'", []);
        console.table(roles);
    } catch (err) {
        console.error('Error fetching roles:', err.message);
    } finally {
        process.exit(0);
    }
}

testRoles();
