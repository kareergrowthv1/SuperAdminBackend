const mysql = require('mysql2/promise');
const config = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'radhe123',
    database: 'superadmin_db'
};

async function updateJudge0() {
    const connection = await mysql.createConnection(config);
    try {
        const settings = JSON.stringify({
            enabled: true,
            baseUrl: 'https://judge0-ce.p.rapidapi.com',
            apiKey: '43512c6e30msh41aa5f2ad892b93p19f52ejsn453b56bbb766'
        });
        await connection.query(
            "INSERT INTO settings (`key`, `value`) VALUES ('judge0Settings', ?) ON DUPLICATE KEY UPDATE `value` = ?",
            [settings, settings]
        );
        console.log("Judge0 settings updated successfully in DB");
    } catch (err) {
        console.error("Failed to update Judge0 settings:", err.message);
    } finally {
        await connection.end();
    }
}

updateJudge0();
