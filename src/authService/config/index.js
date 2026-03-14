// Auth service config: use main app config with auth_db for database name
const mainConfig = require('../../config');

module.exports = {
    ...mainConfig,
    database: {
        ...mainConfig.authDatabase,
        name: mainConfig.authDatabase?.name || 'auth_db'
    }
};
