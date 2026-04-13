require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DB_NAME || 'auth_db', process.env.DB_USER || 'root', process.env.DB_PASS || 'ifocus', {
  host: process.env.DB_HOST || 'localhost',
  dialect: 'mysql',
});

async function run() {
  try {
    const userId = "62e66c61-cfe1-4ba5-8f87-da7d6df45e7e";
    await sequelize.query('UPDATE users SET isCollege = false WHERE id = ?', {
      replacements: [userId]
    });
    console.log("Updated successfully");
  } catch (err) {
    console.error("Error connecting or updating DB:", err);
  } finally {
    await sequelize.close();
  }
}
run();
