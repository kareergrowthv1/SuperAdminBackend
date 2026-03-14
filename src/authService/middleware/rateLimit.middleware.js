// Rate Limiting Middleware - Prevents abuse with rate limiting
const rateLimit = require('express-rate-limit');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const config = require('../config');

// Redis store for distributed rate limiting
class RedisStore {
    constructor(options = {}) {
        this.prefix = options.prefix || 'rl:';
        this.resetExpiryOnChange = options.resetExpiryOnChange || false;
    }

    async increment(key) {
        try {
            const redisKey = this.prefix + key;
            const redisClient = redis.getRedisClient();
            
            const current = await redisClient.incr(redisKey);
            
            let ttl;
            if (current === 1) {
                // First request - set expiry
                const windowMs = config.security.rateLimitWindowMinutes * 60;
                await redisClient.expire(redisKey, windowMs);
                ttl = windowMs * 1000; // Convert to milliseconds
            } else {
                // Get remaining TTL
                const remainingTtl = await redisClient.ttl(redisKey);
                ttl = remainingTtl * 1000;
            }

            return {
                totalHits: current,
                resetTime: new Date(Date.now() + ttl)
            };
        } catch (error) {
            logger.error('Rate limit increment error', { error: error.message, key });
            // Fail open - allow request if Redis fails
            return { totalHits: 0, resetTime: new Date() };
        }
    }

    async decrement(key) {
        try {
            const redisKey = this.prefix + key;
            const redisClient = redis.getRedisClient();
            await redisClient.decr(redisKey);
        } catch (error) {
            logger.error('Rate limit decrement error', { error: error.message, key });
        }
    }

    async resetKey(key) {
        try {
            const redisKey = this.prefix + key;
            await redis.del(redisKey);
        } catch (error) {
            logger.error('Rate limit reset error', { error: error.message, key });
        }
    }
}

// Create rate limiter based on IP
const createRateLimiter = (options = {}) => {
    if (!config.features.enableRateLimiting) {
        // Return a pass-through middleware if rate limiting is disabled
        return (req, res, next) => next();
    }

    const {
        windowMinutes = config.security.rateLimitWindowMinutes,
        maxRequests = config.security.rateLimitMaxRequests,
        message = 'Too many requests, please try again later',
        skipSuccessfulRequests = false,
        skipFailedRequests = false,
        keyGenerator = (req) => req.ip || 'unknown'
    } = options;

    return rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        max: maxRequests,
        message: { success: false, message, code: 'RATE_LIMIT_EXCEEDED' },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests,
        skipFailedRequests,
        keyGenerator,
        handler: (req, res) => {
            logger.warn('Rate limit exceeded', {
                ip: req.ip,
                userId: req.user?.userId,
                path: req.path,
                requestId: req.requestId
            });

            res.status(429).json({
                success: false,
                message,
                code: 'RATE_LIMIT_EXCEEDED'
            });
        },
        store: new RedisStore({ prefix: 'rl:' })
    });
};

// Auth rate limit: lenient by default so normal login/refresh don't hit 429.
// Set ENABLE_AUTH_RATE_LIMITING=false to disable; or RATE_LIMIT_AUTH_MAX_REQUESTS / RATE_LIMIT_AUTH_WINDOW_MINUTES to tune.
const authRateLimitEnabled = process.env.ENABLE_AUTH_RATE_LIMITING !== 'false';
const authWindowMinutes = parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MINUTES, 10) || 15;
const authMaxRequests = parseInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS, 10) || 100;

const authRateLimiter = authRateLimitEnabled
    ? createRateLimiter({
        windowMinutes: authWindowMinutes,
        maxRequests: authMaxRequests,
        message: 'Too many authentication attempts, please try again later'
    })
    : (req, res, next) => next();

const apiRateLimiter = createRateLimiter({
    windowMinutes: 15,
    maxRequests: 100,
    message: 'Too many API requests, please slow down'
});

const strictRateLimiter = createRateLimiter({
    windowMinutes: 15,
    maxRequests: 5,
    message: 'Too many requests, please wait before trying again'
});

module.exports = {
    createRateLimiter,
    auth: authRateLimiter,
    api: apiRateLimiter,
    strict: strictRateLimiter,
    // Also export with full names for compatibility
    authRateLimiter,
    apiRateLimiter,
    strictRateLimiter
};
