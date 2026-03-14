const mysql = require('mysql2/promise');
const config = require('./index');

let pool = null;
let authPool = null;

const initializePool = async () => {
    if (pool) {
        return pool;
    }

    // Superadmin DB pool
    pool = mysql.createPool({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.name,
        waitForConnections: true,
        connectionLimit: config.database.poolSize,
        queueLimit: 0,
        charset: 'utf8mb4',
        timezone: '+00:00'
    });

    // Auth DB pool (users, roles, organizations — always auth_db, never candidates_db)
    const authDbConfig = config.authDatabase || {
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        name: 'auth_db',
        poolSize: config.database.poolSize
    };
    authPool = mysql.createPool({
        host: authDbConfig.host,
        port: authDbConfig.port,
        user: authDbConfig.user,
        password: authDbConfig.password,
        database: authDbConfig.name,
        waitForConnections: true,
        connectionLimit: authDbConfig.poolSize || 10,
        queueLimit: 0,
        charset: 'utf8mb4',
        timezone: '+00:00'
    });

    return pool;
};

const getPool = () => {
    if (!pool) {
        throw new Error('MySQL pool not initialized. Call initializePool first.');
    }
    return pool;
};

const getAuthPool = () => {
    if (!authPool) {
        throw new Error('Auth MySQL pool not initialized. Call initializePool first.');
    }
    return authPool;
};

const query = async (sql, params = []) => {
    const connection = await getPool().getConnection();
    try {
        const [rows] = await connection.execute(sql, params);
        return rows;
    } finally {
        connection.release();
    }
};

const authQuery = async (sql, params = []) => {
    const connection = await getAuthPool().getConnection();
    try {
        const [rows] = await connection.execute(sql, params);
        return rows;
    } finally {
        connection.release();
    }
};

const createDatabase = async (schemaName) => {
    const tempPool = mysql.createPool({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        waitForConnections: true,
        connectionLimit: 1,
        queueLimit: 0
    });

    try {
        const conn = await tempPool.getConnection();
        await conn.query(
            `CREATE DATABASE IF NOT EXISTS \`${schemaName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        conn.release();
    } finally {
        await tempPool.end();
    }
};

const clientQuery = async (schemaName, sql, params = []) => {
    const tempPool = mysql.createPool({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: schemaName,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        charset: 'utf8mb4',
        timezone: '+00:00'
    });

    try {
        const connection = await tempPool.getConnection();
        try {
            const [rows] = await connection.execute(sql, params);
            return rows;
        } finally {
            connection.release();
        }
    } finally {
        await tempPool.end();
    }
};

module.exports = {
    initializePool,
    getPool,
    getAuthPool,
    query,
    authQuery,
    createDatabase,
    clientQuery
};
