// XSRF Token Utilities for Cross-Site Request Forgery Protection
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const redis = require('../config/redis');
const logger = require('./logger');

/**
 * Generate XSRF Token (random 32-byte token)
 * @param {object} context - Token context (userId, sessionId, etc.)
 * @returns {object} { token, tokenHash }
 */
const generateXSRFToken = async (context = {}) => {
    try {
        // Generate random 32-byte token
        const token = crypto.randomBytes(32).toString('hex');
        
        // Create SHA-256 hash for storage
        const tokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        const expirySeconds = config.xsrf.tokenExpiryMinutes * 60; // 60 minutes
        const now = new Date();
        const expiresAt = new Date(now.getTime() + expirySeconds * 1000);

        // Store token metadata in Redis (subjectType: 'candidate' for candidate portal)
        const tokenData = {
            userId: context.userId || null,
            organizationId: context.organizationId || null,
            subjectType: context.subjectType || null,
            sessionId: context.sessionId || null,
            requestId: context.requestId || uuidv4(),
            issuedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            ipAddress: context.ipAddress || null,
            userAgent: context.userAgent || null
        };

        await redis.set(
            `xsrf:${tokenHash}`,
            tokenData,
            expirySeconds
        );

        logger.debug('XSRF token generated', {
            tokenHash: tokenHash.substring(0, 10) + '...',
            userId: context.userId,
            expiresIn: `${config.xsrf.tokenExpiryMinutes} minutes`
        });

        return {
            token, // Raw token to send to client
            tokenHash, // Hash stored in Redis
            expiresAt
        };
    } catch (error) {
        logger.error('Failed to generate XSRF token', { error: error.message });
        throw new Error('XSRF token generation failed');
    }
};

/**
 * Verify XSRF Token
 * @param {string} token - Raw token from request header/cookie
 * @param {object} context - Request context for validation
 * @returns {boolean} True if valid
 * @throws {Error} If token is invalid
 */
const verifyXSRFToken = async (token, context = {}) => {
    try {
        if (!token) {
            throw new Error('XSRF token missing');
        }

        // Hash the received token
        const tokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        // Retrieve token data from Redis
        const tokenData = await redis.get(`xsrf:${tokenHash}`);

        if (!tokenData) {
            logger.warn('XSRF token not found or expired', {
                tokenHash: tokenHash.substring(0, 10) + '...'
            });
            throw new Error('XSRF token invalid or expired');
        }

        // Check expiration
        const expiresAt = new Date(tokenData.expiresAt);
        if (expiresAt < new Date()) {
            logger.warn('XSRF token expired', {
                expiresAt: tokenData.expiresAt
            });
            await redis.del(`xsrf:${tokenHash}`);
            throw new Error('XSRF token expired');
        }

        // Validate session if provided
        if (context.sessionId && tokenData.sessionId) {
            if (context.sessionId !== tokenData.sessionId) {
                logger.warn('XSRF token session mismatch', {
                    expected: tokenData.sessionId,
                    received: context.sessionId
                });
                throw new Error('XSRF token session mismatch');
            }
        }

        // Validate user if provided
        if (context.userId && tokenData.userId) {
            if (context.userId !== tokenData.userId) {
                logger.warn('XSRF token user mismatch', {
                    expected: tokenData.userId,
                    received: context.userId
                });
                throw new Error('XSRF token user mismatch');
            }
        }

        logger.debug('XSRF token verified successfully', {
            tokenHash: tokenHash.substring(0, 10) + '...',
            userId: tokenData.userId
        });

        return true;
    } catch (error) {
        logger.error('XSRF token verification failed', {
            error: error.message,
            userId: context.userId
        });
        throw error;
    }
};

/**
 * Consume XSRF Token (one-time use)
 * Marks token as used and removes from Redis
 * @param {string} token - Raw token
 */
const consumeXSRFToken = async (token) => {
    try {
        const tokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        // Remove from Redis (one-time use)
        await redis.del(`xsrf:${tokenHash}`);

        logger.debug('XSRF token consumed', {
            tokenHash: tokenHash.substring(0, 10) + '...'
        });
    } catch (error) {
        logger.error('Failed to consume XSRF token', { error: error.message });
    }
};

/**
 * Invalidate all XSRF tokens for a user
 * @param {string} userId - User ID
 */
const invalidateUserXSRFTokens = async (userId) => {
    try {
        // Get all XSRF token keys
        const keys = await redis.keys('xsrf:*');

        let invalidatedCount = 0;
        for (const key of keys) {
            const tokenData = await redis.get(key);
            if (tokenData && tokenData.userId === userId) {
                await redis.del(key);
                invalidatedCount++;
            }
        }

        logger.debug('User XSRF tokens invalidated', {
            userId,
            count: invalidatedCount
        });

        return invalidatedCount;
    } catch (error) {
        logger.error('Failed to invalidate user XSRF tokens', {
            userId,
            error: error.message
        });
        throw error;
    }
};

/**
 * Set XSRF cookie on response
 * @param {object} res - Express response object
 * @param {string} token - XSRF token
 */
const setXSRFCookie = (res, token) => {
    const isProduction = config.env === 'production';

    res.cookie('__Host-XSRF-Token', token, {
        httpOnly: true,
        secure: isProduction, // HTTPS only in production
        sameSite: 'strict',
        maxAge: config.xsrf.tokenExpiryMinutes * 60 * 1000, // milliseconds
        path: '/'
    });
};

/**
 * Set XSRF token in response header
 * @param {object} res - Express response object
 * @param {string} token - XSRF token
 */
const setXSRFHeader = (res, token) => {
    res.setHeader('X-XSRF-Token', token);
};

/**
 * Extract XSRF token from request
 * Checks both header and cookie
 * @param {object} req - Express request object
 * @returns {string|null} XSRF token or null
 */
const extractXSRFToken = (req) => {
    // Try header first
    let token = req.get('X-XSRF-Token');

    // Fallback to cookie
    if (!token && req.cookies) {
        token = req.cookies['__Host-XSRF-Token'];
    }

    return token || null;
};

/**
 * Double-submit cookie validation
 * Verifies that header token matches cookie token
 * @param {object} req - Express request object
 * @returns {boolean}
 */
const validateDoubleSubmit = (req) => {
    if (!config.xsrf.doubleSubmit) {
        return true; // Double-submit not enabled
    }

    const headerToken = req.get('X-XSRF-Token');
    const cookieToken = req.cookies ? req.cookies['__Host-XSRF-Token'] : null;

    if (!headerToken || !cookieToken) {
        return false;
    }

    return headerToken === cookieToken;
};

/**
 * Cleanup expired XSRF tokens (maintenance task)
 * Redis TTL handles this automatically, but this is for manual cleanup
 */
const cleanupExpiredTokens = async () => {
    try {
        const keys = await redis.keys('xsrf:*');
        let cleanedCount = 0;

        for (const key of keys) {
            const ttl = await redis.ttl(key);
            if (ttl === -2) {
                // Key doesn't exist (already cleaned by Redis)
                cleanedCount++;
            }
        }

        logger.debug('XSRF token cleanup completed', {
            totalKeys: keys.length,
            cleaned: cleanedCount
        });

        return cleanedCount;
    } catch (error) {
        logger.error('XSRF token cleanup failed', { error: error.message });
        throw error;
    }
};

module.exports = {
    generateXSRFToken,
    verifyXSRFToken,
    consumeXSRFToken,
    invalidateUserXSRFTokens,
    setXSRFCookie,
    setXSRFHeader,
    extractXSRFToken,
    validateDoubleSubmit,
    cleanupExpiredTokens
};
