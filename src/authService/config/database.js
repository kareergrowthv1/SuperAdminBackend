/**
 * Auth DB adapter: uses SuperadminBackend's auth pool (auth_db).
 * Same interface as AuthService database.js for drop-in use by auth modules.
 */
const mainDb = require('../../config/db');
const logger = require('../utils/logger');

const initializeMySQLPool = async () => {
    // Main server already initializes pool in server.js; no-op here
    return mainDb.getAuthPool ? mainDb.getAuthPool() : null;
};

const getPool = () => mainDb.getAuthPool();

const query = async (sql, params = []) => {
    try {
        return await mainDb.authQuery(sql, params);
    } catch (error) {
        logger.error('Database query error', { error: error.message, sql: sql.substring(0, 100) });
        throw error;
    }
};

const queryOne = async (sql, params = []) => {
    const rows = await query(sql, params);
    return rows && rows.length > 0 ? rows[0] : null;
};

const transaction = async (callback) => {
    const connection = await getPool().getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        logger.error('Transaction error', { error: error.message });
        throw error;
    } finally {
        connection.release();
    }
};

const checkConnection = async () => {
    try {
        const result = await query('SELECT 1 as health');
        return result && result.length > 0 && result[0].health === 1;
    } catch (error) {
        logger.error('Database health check failed', { error: error.message });
        return false;
    }
};

const closePool = async () => {
    // Main server owns the pool; no-op
};

module.exports = {
    initializeMySQLPool,
    getPool,
    query,
    queryOne,
    transaction,
    checkConnection,
    closePool
};
