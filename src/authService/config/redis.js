// Redis Client Configuration
const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Initialize Redis Client
 * Supports Redis 4.x+ async/await syntax
 * Optional: Service will work without Redis (caching disabled)
 */
const initializeRedisClient = async () => {
    try {
        const config = {
            socket: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT, 10) || 6379,
                reconnectStrategy: (retries) => {
                    if (retries > 3) {
                        logger.warn('Redis connection failed, running without cache');
                        return false; // Stop reconnecting
                    }
                    return Math.min(retries * 100, 1000);
                }
            },
            database: parseInt(process.env.REDIS_DB, 10) || 0,
            commandsQueueMaxLength: 1000
        }

        redisClient = redis.createClient(config);

        // Error handler
        redisClient.on('error', (err) => {
            logger.warn('Redis client error (running without cache)', { error: err.message });
        });

        // Connection handler
        redisClient.on('connect', () => {
            // Silent connection attempt
        });

        // Ready handler
        redisClient.on('ready', () => {
            logger.info(`✓ Redis connected (${process.env.REDIS_HOST}:${process.env.REDIS_PORT})`);
        });

        // Reconnecting handler
        redisClient.on('reconnecting', () => {
            logger.warn('Redis client reconnecting...');
        });

        // Connect to Redis
        await redisClient.connect();

        return redisClient;
    } catch (error) {
        logger.warn('Redis not available - service will run without caching', {
            error: error.message
        });
        redisClient = null;
        return null;
    }
};

/**
 * Get Redis client instance
 */
const getRedisClient = () => {
    if (!redisClient || !redisClient.isOpen) {
        return null;
    }
    return redisClient;
};

/**
 * Check if Redis is available
 */
const isRedisAvailable = () => {
    return redisClient && redisClient.isOpen;
};

/**
 * Set a key with optional expiration
 * @param {string} key - Redis key
 * @param {string|object} value - Value to store (objects will be JSON stringified)
 * @param {number} ttl - Time to live in seconds (optional)
 */
const set = async (key, value, ttl = null) => {
    try {
        const client = getRedisClient();
        if (!client) {
            logger.debug('Redis not available, skipping cache SET', { key });
            return false;
        }
        
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        
        if (ttl) {
            await client.setEx(key, ttl, stringValue);
        } else {
            await client.set(key, stringValue);
        }
        return true;
    } catch (error) {
        logger.warn('Redis SET error', { key, error: error.message });
        return false;
    }
};

/**
 * Get a key's value
 * @param {string} key - Redis key
 * @param {boolean} parse - Whether to JSON parse the result
 * @returns {Promise<any>} Value or null if not found
 */
const get = async (key, parse = true) => {
    try {
        const client = getRedisClient();
        if (!client) {
            logger.debug('Redis not available, cache GET miss', { key });
            return null;
        }
        
        const value = await client.get(key);
        
        if (!value) return null;
        
        if (parse) {
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }
        
        return value;
    } catch (error) {
        logger.warn('Redis GET error', { key, error: error.message });
        return null;
    }
};

/**
 * Delete a key
 * @param {string} key - Redis key
 */
const del = async (key) => {
    try {
        const client = getRedisClient();
        if (!client) {
            return false;
        }
        await client.del(key);
        return true;
    } catch (error) {
        logger.warn('Redis DEL error', { key, error: error.message });
        return false;
    }
};

/**
 * Check if key exists
 * @param {string} key - Redis key
 * @returns {Promise<boolean>}
 */
const exists = async (key) => {
    try {
        const client = getRedisClient();
        if (!client) {
            return false;
        }
        const result = await client.exists(key);
        return result === 1;
    } catch (error) {
        logger.warn('Redis EXISTS error', { key, error: error.message });
        return false;
    }
};

/**
 * Set expiration on a key
 * @param {string} key - Redis key
 * @param {number} ttl - Time to live in seconds
 */
const expire = async (key, ttl) => {
    try {
        const client = getRedisClient();
        if (!client) {
            return false;
        }
        await client.expire(key, ttl);
        return true;
    } catch (error) {
        logger.warn('Redis EXPIRE error', { key, ttl, error: error.message });
        return false;
    }
};

/**
 * Increment a key's value
 * @param {string} key - Redis key
 * @returns {Promise<number>} New value after increment
 */
const incr = async (key) => {
    try {
        const client = getRedisClient();
        if (!client) {
            return 1; // Simulate first increment
        }
        return await client.incr(key);
    } catch (error) {
        logger.warn('Redis INCR error', { key, error: error.message });
        return 1;
    }
};

/**
 * Get remaining TTL of a key
 * @param {string} key - Redis key
 * @returns {Promise<number>} Seconds remaining (-1 if no expiry, -2 if not found)
 */
const ttl = async (key) => {
    try {
        const client = getRedisClient();
        if (!client) {
            return -2; // Not found
        }
        return await client.ttl(key);
    } catch (error) {
        logger.warn('Redis TTL error', { key, error: error.message });
        return -2;
    }
};

/**
 * Get all keys matching a pattern
 * @param {string} pattern - Pattern to match (e.g., 'session:*')
 * @returns {Promise<array>} Array of matching keys
 */
const keys = async (pattern) => {
    try {
        const client = getRedisClient();
        if (!client) {
            return [];
        }
        return await client.keys(pattern);
    } catch (error) {
        logger.warn('Redis KEYS error', { pattern, error: error.message });
        return [];
    }
};

/**
 * Delete all keys matching a pattern
 * @param {string} pattern - Pattern to match
 * @returns {Promise<number>} Number of keys deleted
 */
const deletePattern = async (pattern) => {
    try {
        const client = getRedisClient();
        if (!client) {
            return 0;
        }
        
        const matchingKeys = await client.keys(pattern);
        
        if (matchingKeys.length === 0) {
            return 0;
        }
        
        await client.del(matchingKeys);
        return matchingKeys.length;
    } catch (error) {
        logger.warn('Redis DELETE PATTERN error', { pattern, error: error.message });
        return 0;
    }
};

/**
 * Flush all data from current database
 * USE WITH EXTREME CAUTION
 */
const flushDb = async () => {
    try {
        const client = getRedisClient();
        if (!client) {
            return false;
        }
        await client.flushDb();
        logger.warn('Redis database flushed');
        return true;
    } catch (error) {
        logger.warn('Redis FLUSHDB error', { error: error.message });
        return false;
    }
};

/**
 * Check Redis connection health
 */
const checkConnection = async () => {
    try {
        const client = getRedisClient();
        if (!client) {
            return false;
        }
        const result = await client.ping();
        return result === 'PONG';
    } catch (error) {
        logger.warn('Redis health check failed', { error: error.message });
        return false;
    }
};

/**
 * Close Redis connection gracefully
 */
const closeRedisClient = async () => {
    if (redisClient && redisClient.isOpen) {
        try {
            await redisClient.quit();
            logger.info('Redis client closed');
            redisClient = null;
        } catch (error) {
            logger.error('Error closing Redis client', { error: error.message });
        }
    }
};

// Graceful shutdown handlers
process.on('SIGINT', async () => {
    await closeRedisClient();
});

process.on('SIGTERM', async () => {
    await closeRedisClient();
});

module.exports = {
    initializeRedisClient,
    getRedisClient,
    isRedisAvailable,
    set,
    get,
    del,
    exists,
    expire,
    incr,
    ttl,
    keys,
    deletePattern,
    flushDb,
    checkConnection,
    closeRedisClient
};
