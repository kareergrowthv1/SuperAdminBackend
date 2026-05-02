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

        let user;
        let currentRoleVersion;

        if (decoded.subjectType === 'candidate') {
            const candidates = await db.query(
                'SELECT * FROM candidate_login WHERE id = ? AND is_active = true',
                [decoded.userId]
            );

            if (candidates.length === 0) {
                return res.status(401).json({
                    success: false,
                    message: 'Candidate not found or inactive',
                    code: 'CANDIDATE_NOT_FOUND'
                });
            }

            const candidate = candidates[0];
            user = {
                id: candidate.id,
                email: candidate.email,
                username: candidate.email || candidate.mobile_number,
                organizationId: candidate.organization_id,
                roleId: null,
                roleCode: 'CANDIDATE',
                isAdmin: false,
                isPlatformAdmin: false,
                isCollege: false,
                isSubscribed: true,
                isHold: false,
                client: decoded.tenantId, // Use tenantId from token for candidates
                subjectType: 'candidate'
            };
            currentRoleVersion = decoded.roleVersion; // Candidates don't have versioned roles in the same way
        } else {
            const treatAsPlatformUser = Boolean(decoded.isPlatformAdmin) || !decoded.organizationId;

            const sql = treatAsPlatformUser ? `
                SELECT u.*, r.version as roleVersion, r.code as roleCode
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE u.id = ? AND u.is_active = true
            ` : `
                SELECT u.*, r.version as roleVersion, r.code as roleCode
                FROM users u
                INNER JOIN roles r ON u.role_id = r.id
                WHERE u.id = ? AND u.organization_id = ? AND u.is_active = true
            `;

            const users = treatAsPlatformUser
                ? await db.query(sql, [decoded.userId])
                : await db.query(sql, [decoded.userId, decoded.organizationId]);

            if (users.length === 0) {
                return res.status(401).json({
                    success: false,
                    message: 'User not found or inactive',
                    code: 'USER_NOT_FOUND'
                });
            }

            const dbUser = users[0];
            user = {
                id: dbUser.id,
                email: dbUser.email,
                username: dbUser.username,
                organizationId: dbUser.organization_id,
                roleId: dbUser.role_id,
                roleCode: dbUser.roleCode,
                roleVersion: dbUser.roleVersion,
                isAdmin: dbUser.is_admin,
                isPlatformAdmin: dbUser.is_platform_admin,
                isCollege: !!dbUser.is_college,
                isSubscribed: !!dbUser.is_subscribed,
                isHold: !!dbUser.is_hold,
                client: dbUser.client,
                subjectType: 'user'
            };
            currentRoleVersion = dbUser.roleVersion;

            // Validate role version (for permission invalidation) - only for platform users
            const cachedVersion = await redis.get(
                roleVersionKey(user.roleId, user.organizationId)
            );

            if (cachedVersion) {
                currentRoleVersion = parseInt(cachedVersion, 10);
            } else if (currentRoleVersion !== undefined && currentRoleVersion !== null) {
                await redis.set(
                    roleVersionKey(user.roleId, user.organizationId),
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
            id: user.id || user.userId,
            userId: user.id || user.userId,
            email: user.email,
            username: user.username,
            organizationId: user.organizationId || user.organization_id,
            roleId: user.roleId || user.role_id,
            roleCode: user.roleCode || user.role_code || null,
            roleVersion: currentRoleVersion,
            isAdmin: user.isAdmin || user.is_admin,
            isPlatformAdmin: user.isPlatformAdmin || user.is_platform_admin,
            isCollege: !!(user.isCollege || user.is_college),
            isSubscribed: !!(user.isSubscribed || user.is_subscribed),
            isHold: !!(user.isHold || user.is_hold),
            client: user.client,
            subjectType: user.subjectType, // IMPORTANT: Pass subjectType to controller/service
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
