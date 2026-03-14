const { organizationFeaturesService } = require('../services');
const logger = require('../utils/logger');

class OrganizationFeaturesController {
    async getOrganizationFeatures(req, res, next) {
        try {
            const organizationId = req.user.organizationId;

            const features = await organizationFeaturesService.getOrganizationFeatures(organizationId);

            res.status(200).json({
                success: true,
                message: 'Organization features retrieved successfully',
                data: {
                    features,
                    count: features.length
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async setFeatureEnabled(req, res, next) {
        try {
            const featureId = req.params.featureId;
            const { isEnabled } = req.body;
            const organizationId = req.user.organizationId;

            const context = {
                userId: req.user.userId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            };

            await organizationFeaturesService.setFeatureEnabled(organizationId, featureId, isEnabled, context);

            res.status(200).json({
                success: true,
                message: `Feature ${isEnabled ? 'enabled' : 'disabled'} successfully`
            });
        } catch (error) {
            next(error);
        }
    }

    async updateFeatureConfig(req, res, next) {
        try {
            const featureId = req.params.featureId;
            const { config } = req.body;
            const organizationId = req.user.organizationId;

            const context = {
                userId: req.user.userId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            };

            await organizationFeaturesService.updateFeatureConfig(organizationId, featureId, config, context);

            res.status(200).json({
                success: true,
                message: 'Feature configuration updated successfully'
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new OrganizationFeaturesController();
