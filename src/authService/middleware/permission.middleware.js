// Permission Middleware - Dynamic permission checker based on feature and scope
const permissionUtils = require('../utils/permissionUtils');
const redis = require('../config/redis');
const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Permission middleware factory
 * @param {string} featureName - Feature name (e.g., 'USERS', 'JOBS')
 * @param {string} requiredScope - Required permission scope (e.g., 'READ', 'CREATE')
 * @returns {Function} Express middleware
 */
const permissionMiddleware = (featureName, requiredScope) => {
    return async (req, res, next) => {
        try {
            const { userId, roleId, organizationId, roleVersion } = req.user;

            // 1. Load permissions from cache
            const cacheKey = `permissions:${roleId}:${roleVersion}`;
            let permissions = await redis.get(cacheKey);

            if (!permissions) {
                // Load from database
                const sql = `
                    SELECT f.name, rfp.permissions
                    FROM role_feature_permissions rfp
                    INNER JOIN features f ON rfp.feature_id = f.id
                    WHERE rfp.role_id = ? AND f.is_active = true
                `;
                
                const results = await db.query(sql, [roleId]);

                // Build permission map
                permissions = {};
                results.forEach(row => {
                    permissions[row.name] = row.permissions;
                });

                // Cache for 24 hours
                await redis.set(cacheKey, permissions, 86400);
            }

            // 2. Check if feature exists in permissions
            const featurePermissionBitmap = permissions[featureName];

            if (featurePermissionBitmap === undefined) {
                logger.warn('Feature not found in user permissions', {
                    userId,
                    roleId,
                    featureName
                });

                return res.status(403).json({
                    success: false,
                    message: `Access denied: No permissions for ${featureName}`,
                    code: 'NO_FEATURE_ACCESS'
                });
            }

            // 3. Check specific scope permission
            const hasRequiredPermission = permissionUtils.hasPermission(
                featurePermissionBitmap,
                requiredScope
            );

            if (!hasRequiredPermission) {
                logger.warn('Insufficient permissions', {
                    userId,
                    roleId,
                    featureName,
                    requiredScope,
                    userPermissions: permissionUtils.bitmapToPermissions(featurePermissionBitmap)
                });

                return res.status(403).json({
                    success: false,
                    message: `Permission denied: ${requiredScope} on ${featureName}`,
                    code: 'INSUFFICIENT_PERMISSIONS',
                    required: requiredScope,
                    feature: featureName
                });
            }

            // 4. Check organization feature flags (if applicable)
            const orgFeatureKey = `org:features:${organizationId}`;
            let orgFeatures = await redis.get(orgFeatureKey);

            if (!orgFeatures) {
                const sql = `
                    SELECT feature_key, is_enabled, config
                    FROM organization_features
                    WHERE organization_id = ? AND is_active = true
                `;
                
                const features = await db.query(sql, [organizationId]);

                orgFeatures = {};
                features.forEach(f => {
                    orgFeatures[f.feature_key] = {
                        enabled: f.is_enabled,
                        config: f.config
                    };
                });

                // Cache for 6 hours
                await redis.set(orgFeatureKey, orgFeatures, 21600);
            }

            // 5. Store in request for use in handler
            req.permissionBitmap = featurePermissionBitmap;
            req.permissions = permissions;
            req.orgFeatures = orgFeatures;

            next();
        } catch (error) {
            logger.error('Permission check error', {
                error: error.message,
                featureName,
                requiredScope
            });
            res.status(500).json({
                success: false,
                message: 'Authorization check failed'
            });
        }
    };
};

module.exports = permissionMiddleware;
