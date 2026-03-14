// JWT Authentication Middleware - Verifies JWT and loads user context
const jwtUtils = require('../utils/jwtUtils');
const logger = require('../utils/logger');
const db = require('../config/database');
const redis = require('../config/redis');

const jwtAuthMiddleware = async (req, res, next) => {
    try {
        // Extract JWT from Authorization header or cookie
        let token = null;

        // Try Authorization header first
        const authHeader = req.get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7);
        }

        // Fallback to cookie
        if (!token && req.cookies?.accessToken) {
            token = req.cookies.accessToken;
        }

        if (!token && req.cookies?.access_token) {
            token = req.cookies.access_token;
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication token required',
                code: 'TOKEN_MISSING'
            });
        }

        // Verify and decode JWT
        const decoded = await jwtUtils.verifyAccessToken(token);

        // Load user from database for fresh data
        const roleVersionKey = (roleId, organizationId) => (
            `role:version:${roleId}:${organizationId || 'platform'}`
        );

        const sql = decoded.isPlatformAdmin ? `
            SELECT u.*, r.version as roleVersion
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE u.id = ? AND u.is_active = true
        ` : `
            SELECT u.*, r.version as roleVersion
            FROM users u
            INNER JOIN roles r ON u.role_id = r.id
            WHERE u.id = ? AND u.organization_id = ? AND u.is_active = true
        `;

        const users = decoded.isPlatformAdmin
            ? await db.query(sql, [decoded.userId])
            : await db.query(sql, [decoded.userId, decoded.organizationId]);

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'User not found or inactive',
                code: 'USER_NOT_FOUND'
            });
        }

        const user = users[0];

        // Validate role version (for permission invalidation)
        let currentRoleVersion = user.roleVersion;
        const cachedVersion = await redis.get(
            roleVersionKey(user.role_id, user.organization_id)
        );

        if (cachedVersion) {
            currentRoleVersion = parseInt(cachedVersion, 10);
        } else if (currentRoleVersion !== undefined && currentRoleVersion !== null) {
            await redis.set(
                roleVersionKey(user.role_id, user.organization_id),
                String(currentRoleVersion),
                86400
            );
        }

        if (decoded.roleVersion !== currentRoleVersion) {
            logger.warn('Role version mismatch - token invalidated', {
                userId: user.id,
                tokenVersion: decoded.roleVersion,
                currentVersion: currentRoleVersion
            });

            return res.status(401).json({
                success: false,
                message: 'Token expired due to permission changes. Please login again.',
                code: 'TOKEN_VERSION_MISMATCH'
            });
        }

        // Check if account is locked
        if (user.account_locked) {
            return res.status(403).json({
                success: false,
                message: 'Account is locked. Contact administrator.',
                code: 'ACCOUNT_LOCKED'
            });
        }

        // Check if account is expired
        if (user.account_expired) {
            return res.status(403).json({
                success: false,
                message: 'Account has expired',
                code: 'ACCOUNT_EXPIRED'
            });
        }

        // Check if credentials are expired
        if (user.credentials_expired) {
            return res.status(403).json({
                success: false,
                message: 'Password has expired. Please reset your password.',
                code: 'CREDENTIALS_EXPIRED'
            });
        }

        // Store user info in request
        req.user = {
            userId: user.id,
            email: user.email,
            username: user.username,
            organizationId: user.organization_id,
            roleId: user.role_id,
            roleVersion: currentRoleVersion,
            isAdmin: user.is_admin,
            isPlatformAdmin: user.is_platform_admin,
            client: user.client,
            jti: decoded.jti
        };

        req.token = token;

        next();
    } catch (error) {
        logger.error('JWT authentication error', { error: error.message });

        if (error.message === 'Token expired') {
            return res.status(401).json({
                success: false,
                message: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }

        if (error.message === 'Token has been revoked') {
            return res.status(401).json({
                success: false,
                message: 'Token has been revoked',
                code: 'TOKEN_REVOKED'
            });
        }

        res.status(401).json({
            success: false,
            message: 'Authentication failed',
            code: 'AUTH_FAILED'
        });
    }
};

module.exports = jwtAuthMiddleware;
