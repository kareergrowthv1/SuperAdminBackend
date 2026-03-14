const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

class OrganizationFeaturesService {
    async getOrganizationFeatures(organizationId) {
        try {
            const sql = `SELECT f.id as feature_id, f.name as feature_name, f.feature_key, f.description, of.is_enabled, of.config, of.created_at, of.updated_at FROM organization_features of INNER JOIN features f ON of.feature_id = f.id WHERE of.organization_id = ? ORDER BY f.name`;
            return await db.query(sql, [organizationId]);
        } catch (error) {
            logger.error('Get organization features failed', { error: error.message });
            throw error;
        }
    }

    async isFeatureEnabled(organizationId, featureKey) {
        try {
            const cacheKey = `org:${organizationId}:feature:${featureKey}`;
            const cached = await redis.get(cacheKey);
            if (cached !== null) return cached.isEnabled;

            const sql = `SELECT of.is_enabled FROM organization_features of INNER JOIN features f ON of.feature_id = f.id WHERE of.organization_id = ? AND f.feature_key = ?`;
            const results = await db.query(sql, [organizationId, featureKey]);
            const isEnabled = results.length > 0 ? results[0].is_enabled : false;
            await redis.set(cacheKey, { isEnabled }, 300);
            return isEnabled;
        } catch (error) {
            logger.error('Check feature enabled failed', { error: error.message });
            return true;
        }
    }

    async setFeatureEnabled(organizationId, featureId, isEnabled, context = {}) {
        try {
            const features = await db.query('SELECT id, feature_key FROM features WHERE id = ?', [featureId]);
            if (features.length === 0) throw new Error('Feature not found');

            const featureKey = features[0].feature_key;
            const oldFeature = await db.query('SELECT is_enabled FROM organization_features WHERE organization_id = ? AND feature_id = ?', [organizationId, featureId]);
            const id = uuidv4();

            if (oldFeature.length > 0) {
                await db.query('UPDATE organization_features SET is_enabled = ?, updated_at = NOW() WHERE organization_id = ? AND feature_id = ?', [isEnabled, organizationId, featureId]);
            } else {
                await db.query('INSERT INTO organization_features (id, organization_id, feature_id, is_enabled, config, created_at) VALUES (?, ?, ?, ?, NULL, NOW())', [id, organizationId, featureId, isEnabled]);
            }

            const cacheKey = `org:${organizationId}:feature:${featureKey}`;
            await redis.del(cacheKey);

            await auditService.log({ organizationId, userId: context.userId, action: oldFeature.length > 0 ? 'UPDATE' : 'CREATE', resourceType: 'ORGANIZATION_FEATURE', resourceId: `${organizationId}:${featureId}`, oldValues: oldFeature.length > 0 ? { isEnabled: oldFeature[0].is_enabled } : null, newValues: { isEnabled }, ipAddress: context.ipAddress, userAgent: context.userAgent, requestId: context.requestId, status: 'SUCCESS' });
            logger.info('Organization feature enabled status updated', { organizationId, featureId, isEnabled });
        } catch (error) {
            logger.error('Set feature enabled failed', { error: error.message });
            throw error;
        }
    }

    async updateFeatureConfig(organizationId, featureId, config, context = {}) {
        try {
            const features = await db.query('SELECT id, feature_key FROM features WHERE id = ?', [featureId]);
            if (features.length === 0) throw new Error('Feature not found');

            const featureKey = features[0].feature_key;
            const oldFeature = await db.query('SELECT config FROM organization_features WHERE organization_id = ? AND feature_id = ?', [organizationId, featureId]);
            if (oldFeature.length === 0) throw new Error('Organization feature not found');

            await db.query('UPDATE organization_features SET config = ?, updated_at = NOW() WHERE organization_id = ? AND feature_id = ?', [JSON.stringify(config), organizationId, featureId]);

            const cacheKey = `org:${organizationId}:feature:${featureKey}`;
            await redis.del(cacheKey);

            await auditService.log({ organizationId, userId: context.userId, action: 'UPDATE', resourceType: 'ORGANIZATION_FEATURE', resourceId: `${organizationId}:${featureId}`, oldValues: { config: oldFeature[0].config }, newValues: { config }, ipAddress: context.ipAddress, userAgent: context.userAgent, requestId: context.requestId, status: 'SUCCESS' });
            logger.info('Organization feature config updated', { organizationId, featureId });
        } catch (error) {
            logger.error('Update feature config failed', { error: error.message });
            throw error;
        }
    }

    async initializeDefaultFeatures(organizationId) {
        try {
            const features = await db.query('SELECT id FROM features');
            for (const feature of features) {
                const id = uuidv4();
                await db.query('INSERT INTO organization_features (id, organization_id, feature_id, is_enabled, created_at) VALUES (?, ?, ?, true, NOW())', [id, organizationId, feature.id]);
            }
            logger.info('Default features initialized', { organizationId, count: features.length });
        } catch (error) {
            logger.error('Initialize default features failed', { error: error.message });
            throw error;
        }
    }
}

module.exports = OrganizationFeaturesService;
