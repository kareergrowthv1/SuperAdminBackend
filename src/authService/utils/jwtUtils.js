// JWT Utilities for Token Generation, Verification, and Refresh
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const config = require('../config');
const redis = require('../config/redis');
const db = require('../config/database');
const logger = require('./logger');

const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate Access Token (30 minutes expiration)
 * Minimal payload with only essential user identity
 * @param {object} user - User object from database
 * @param {object} options - Additional options like tenantId, roleName, permissions
 * @returns {string} JWT access token
 */
const generateAccessToken = (user, options = {}) => {
    try {
        const jti = uuidv4(); // Unique token identifier
        const now = Math.floor(Date.now() / 1000);

        const payload = {
            jti,                                    // JWT ID (unique)
            sub: user.email,                        // Subject (email)
            userId: user.id,                        // User ID
            tenantId: options.tenantId || 'auth_db', // Tenant/Database name
            organizationId: user.organization_id,   // Organization ID
            roleId: user.role_id,                   // Role ID
            roleName: options.roleName || user.roleCode || 'USER', // Role name
            roleVersion: user.roleVersion || 1,     // Role version for invalidation
            isPlatformAdmin: user.is_platform_admin || false,
            permissions: options.permissions || [],  // User permissions array
            iat: now,                              // Issued at
            exp: now + (config.jwt.expirationMinutes * 60) // Expiration (30 mins)
        };

        const token = jwt.sign(
            payload,
            config.jwt.secret,
            { algorithm: config.jwt.algorithm }
        );

        logger.debug('Access token generated', {
            userId: user.id,
            jti,
            expiresIn: `${config.jwt.expirationMinutes} minutes`
        });

        return token;
    } catch (error) {
        logger.error('Failed to generate access token', { error: error.message });
        throw new Error('Token generation failed');
    }
};

/**
 * Generate Refresh Token (7 days expiration)
 * @param {object} user - User object from database
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = async (user) => {
    try {
        const jti = uuidv4();
        const now = Math.floor(Date.now() / 1000);
        const expirationSeconds = config.jwt.refreshExpirationDays * 24 * 60 * 60;

        const payload = {
            jti,
            sub: user.email,
            userId: user.id,
            organizationId: user.organization_id,
            roleId: user.role_id,
            type: 'refresh',
            iat: now,
            exp: now + expirationSeconds // 7 days
        };

        const token = jwt.sign(
            payload,
            config.jwt.refreshSecret,
            { algorithm: config.jwt.algorithm }
        );

        const tokenHash = hashToken(token);

        // Store refresh token in DB
        const refreshId = uuidv4();
        const expiresAt = new Date((now + expirationSeconds) * 1000);
        await db.query(
            `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at)
             VALUES (?, ?, ?, ?, false, NOW())
             ON DUPLICATE KEY UPDATE revoked = false, expires_at = VALUES(expires_at)` ,
            [refreshId, user.id, tokenHash, expiresAt]
        );

        // Store refresh token in Redis (cache)
        const tokenData = {
            userId: user.id,
            organizationId: user.organization_id,
            roleId: user.role_id,
            issuedAt: now
        };

        await redis.set(
            `token:refresh:${jti}`,
            tokenData,
            expirationSeconds
        );

        logger.debug('Refresh token generated', {
            userId: user.id,
            jti,
            expiresIn: `${config.jwt.refreshExpirationDays} days`
        });

        return token;
    } catch (error) {
        logger.error('Failed to generate refresh token', { error: error.message });
        throw new Error('Refresh token generation failed');
    }
};

/**
 * Generate Access Token for candidate (candidate_login table).
 * Payload includes subjectType: 'candidate' so refresh/middleware can distinguish.
 */
const generateCandidateAccessToken = (candidate, options = {}) => {
    try {
        const jti = uuidv4();
        const now = Math.floor(Date.now() / 1000);
        const sub = candidate.email || candidate.mobile_number || candidate.id;

        const payload = {
            jti,
            sub,
            userId: candidate.id,
            subjectType: 'candidate',
            tenantId: options.tenantId || 'auth_db',
            organizationId: candidate.organization_id || null,
            roleName: 'CANDIDATE',
            permissions: [],
            iat: now,
            exp: now + (config.jwt.expirationMinutes * 60)
        };

        const token = jwt.sign(
            payload,
            config.jwt.secret,
            { algorithm: config.jwt.algorithm }
        );

        logger.debug('Candidate access token generated', { candidateId: candidate.id, jti });
        return token;
    } catch (error) {
        logger.error('Failed to generate candidate access token', { error: error.message });
        throw new Error('Token generation failed');
    }
};

/**
 * Generate Refresh Token for candidate; stores in candidate_refresh_tokens.
 */
const generateCandidateRefreshToken = async (candidate) => {
    try {
        const jti = uuidv4();
        const now = Math.floor(Date.now() / 1000);
        const expirationSeconds = config.jwt.refreshExpirationDays * 24 * 60 * 60;
        const sub = candidate.email || candidate.mobile_number || candidate.id;

        const payload = {
            jti,
            sub,
            userId: candidate.id,
            subjectType: 'candidate',
            type: 'refresh',
            iat: now,
            exp: now + expirationSeconds
        };

        const token = jwt.sign(
            payload,
            config.jwt.refreshSecret,
            { algorithm: config.jwt.algorithm }
        );

        const tokenHash = hashToken(token);
        const refreshId = uuidv4();
        const expiresAt = new Date((now + expirationSeconds) * 1000);

        await db.query(
            `INSERT INTO candidate_refresh_tokens (id, candidate_id, token_hash, expires_at, revoked, created_at)
             VALUES (?, ?, ?, ?, false, NOW())`,
            [refreshId, candidate.id, tokenHash, expiresAt]
        );

        await redis.set(
            `token:refresh:candidate:${jti}`,
            { candidateId: candidate.id, issuedAt: now },
            expirationSeconds
        );

        logger.debug('Candidate refresh token generated', { candidateId: candidate.id, jti });
        return token;
    } catch (error) {
        logger.error('Failed to generate candidate refresh token', { error: error.message });
        throw new Error('Refresh token generation failed');
    }
};

/**
 * Generate token pair for candidate (access + refresh).
 */
const generateCandidateTokenPair = async (candidate, options = {}) => {
    try {
        const accessToken = generateCandidateAccessToken(candidate, options);
        const refreshToken = await generateCandidateRefreshToken(candidate);
        return { accessToken, refreshToken };
    } catch (error) {
        logger.error('Failed to generate candidate token pair', { error: error.message });
        throw error;
    }
};

/**
 * Verify Access Token
 * @param {string} token - JWT access token
 * @returns {object} Decoded token payload
 * @throws {Error} If token is invalid, expired, or blacklisted
 */
const verifyAccessToken = async (token) => {
    try {
        // Verify signature and expiration
        const decoded = jwt.verify(token, config.jwt.secret, {
            algorithms: [config.jwt.algorithm]
        });

        // Check if token is blacklisted (logged out)
        const isBlacklisted = await redis.exists(`token:blacklist:${decoded.jti}`);

        if (isBlacklisted) {
            throw new Error('Token has been revoked');
        }

        return decoded;
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            logger.debug('Token expired', { exp: error.expiredAt });
            throw new Error('Token expired');
        } else if (error.name === 'JsonWebTokenError') {
            logger.warn('Invalid token', { error: error.message });
            throw new Error('Invalid token');
        } else {
            logger.error('Token verification failed', { error: error.message });
            throw error;
        }
    }
};

/**
 * Verify Refresh Token
 * @param {string} token - JWT refresh token
 * @returns {object} Decoded token payload
 * @throws {Error} If token is invalid, expired, or not found in Redis
 */
const verifyRefreshToken = async (token) => {
    try {
        // Verify signature and expiration
        const decoded = jwt.verify(token, config.jwt.refreshSecret, {
            algorithms: [config.jwt.algorithm]
        });

        const tokenHash = hashToken(token);

        // Candidate refresh tokens go to candidate_refresh_tokens
        if (decoded.subjectType === 'candidate') {
            const cRows = await db.query(
                `SELECT id, candidate_id, revoked, expires_at
                 FROM candidate_refresh_tokens
                 WHERE token_hash = ? AND candidate_id = ?`,
                [tokenHash, decoded.userId]
            );
            if (cRows.length === 0) throw new Error('Refresh token not found or expired');
            const rec = cRows[0];
            if (rec.revoked) throw new Error('Refresh token revoked');
            if (rec.expires_at && new Date(rec.expires_at) < new Date()) throw new Error('Refresh token expired');
            if (decoded.type !== 'refresh') throw new Error('Invalid token type');
            return decoded;
        }

        // User refresh tokens
        const rows = await db.query(
            `SELECT id, user_id, revoked, expires_at
             FROM refresh_tokens
             WHERE token_hash = ? AND user_id = ?`,
            [tokenHash, decoded.userId]
        );

        if (rows.length === 0) {
            throw new Error('Refresh token not found or expired');
        }

        const record = rows[0];
        if (record.revoked) {
            throw new Error('Refresh token revoked');
        }

        if (record.expires_at && new Date(record.expires_at) < new Date()) {
            throw new Error('Refresh token expired');
        }

        if (decoded.type !== 'refresh') {
            throw new Error('Invalid token type');
        }

        return decoded;
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            logger.debug('Refresh token expired', { exp: error.expiredAt });
            throw new Error('Refresh token expired');
        } else if (error.name === 'JsonWebTokenError') {
            logger.warn('Invalid refresh token', { error: error.message });
            throw new Error('Invalid refresh token');
        } else {
            logger.error('Refresh token verification failed', { error: error.message });
            throw error;
        }
    }
};

/**
 * Decode token without verification (for debugging/logging)
 * @param {string} token - JWT token
 * @returns {object} Decoded payload
 */
const decodeToken = (token) => {
    try {
        return jwt.decode(token);
    } catch (error) {
        logger.error('Failed to decode token', { error: error.message });
        return null;
    }
};

/**
 * Blacklist a token (for logout)
 * @param {string} jti - JWT ID
 * @param {number} exp - Expiration timestamp
 */
const blacklistToken = async (jti, exp) => {
    try {
        const now = Math.floor(Date.now() / 1000);
        const ttl = exp - now;

        if (ttl > 0) {
            await redis.set(`token:blacklist:${jti}`, '1', ttl);
            logger.debug('Token blacklisted', { jti, ttl });
        }
    } catch (error) {
        logger.error('Failed to blacklist token', { jti, error: error.message });
        throw error;
    }
};

/**
 * Remove refresh token from Redis
 * @param {string} jti - JWT ID
 */
const revokeRefreshToken = async (token) => {
    try {
        if (!token) return;

        const decoded = jwt.decode(token);
        const tokenHash = hashToken(token);

        if (decoded?.subjectType === 'candidate') {
            await db.query(
                'UPDATE candidate_refresh_tokens SET revoked = true WHERE token_hash = ?',
                [tokenHash]
            );
            if (decoded?.jti) await redis.del(`token:refresh:candidate:${decoded.jti}`);
        } else {
            await db.query(
                'UPDATE refresh_tokens SET revoked = true WHERE token_hash = ?',
                [tokenHash]
            );
            if (decoded?.jti) await redis.del(`token:refresh:${decoded.jti}`);
        }

        logger.debug('Refresh token revoked');
    } catch (error) {
        logger.error('Failed to revoke refresh token', { error: error.message });
        throw error;
    }
};

/**
 * Check if token is blacklisted
 * @param {string} jti - JWT ID
 * @returns {boolean}
 */
const isTokenBlacklisted = async (jti) => {
    try {
        return await redis.exists(`token:blacklist:${jti}`);
    } catch (error) {
        logger.error('Failed to check token blacklist', { jti, error: error.message });
        return false;
    }
};

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null
 */
const extractTokenFromHeader = (authHeader) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.slice(7); // Remove 'Bearer ' prefix
};

/**
 * Generate token pair (access + refresh)
 * @param {object} user - User object
 * @returns {object} { accessToken, refreshToken }
 */
const generateTokenPair = async (user, options = {}) => {
    try {
        const accessToken = generateAccessToken(user, options);
        const refreshToken = await generateRefreshToken(user);

        return {
            accessToken,
            refreshToken
        };
    } catch (error) {
        logger.error('Failed to generate token pair', { error: error.message });
        throw error;
    }
};

/**
 * Validate token role version against current role version
 * @param {number} tokenRoleVersion - Role version from token
 * @param {number} currentRoleVersion - Current role version from database
 * @returns {boolean}
 */
const isRoleVersionValid = (tokenRoleVersion, currentRoleVersion) => {
    return tokenRoleVersion === currentRoleVersion;
};

/**
 * Get token expiration time in seconds
 * @param {object} decoded - Decoded token payload
 * @returns {number} Seconds until expiration (negative if expired)
 */
const getTokenTTL = (decoded) => {
    const now = Math.floor(Date.now() / 1000);
    return decoded.exp - now;
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    generateCandidateAccessToken,
    generateCandidateRefreshToken,
    generateCandidateTokenPair,
    verifyAccessToken,
    verifyRefreshToken,
    decodeToken,
    blacklistToken,
    revokeRefreshToken,
    isTokenBlacklisted,
    extractTokenFromHeader,
    generateTokenPair,
    isRoleVersionValid,
    getTokenTTL
};
