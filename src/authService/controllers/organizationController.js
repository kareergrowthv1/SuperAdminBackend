const { organizationService } = require('../services');
const logger = require('../utils/logger');

class OrganizationController {
    async createOrganization(req, res, next) {
        try {
            const {
                name,
                description,
                subscriptionTier,
                metadata,
                adminEmail,
                adminPassword,
                adminFirstName,
                adminLastName,
                adminPhoneNumber
            } = req.body;

            const result = await organizationService.createOrganization({
                name,
                description,
                subscriptionTier,
                metadata,
                adminEmail,
                adminPassword,
                adminFirstName,
                adminLastName,
                adminPhoneNumber
            });

            res.status(201).json({
                success: true,
                message: 'Organization created successfully',
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async getAllOrganizations(req, res, next) {
        try {
            const organizations = await organizationService.getAllOrganizations();

            res.status(200).json({
                success: true,
                data: {
                    organizations,
                    count: organizations.length
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async getOrganizationById(req, res, next) {
        try {
            const organizationId = req.params.id;

            const organization = await organizationService.getOrganizationById(organizationId);

            if(!organization) {
                return res.status(404).json({
                    success: false,
                    message: 'Organization not found'
                });
            }

            res.status(200).json({
                success: true,
                data: { organization }
            });
        } catch (error) {
            next(error);
        }
    }

    async getCurrentOrganization(req, res, next) {
        try {
            const organizationId = req.user.organizationId;

            const organization = await organizationService.getOrganizationById(organizationId);

            if(!organization) {
                return res.status(404).json({
                    success: false,
                    message: 'Organization not found'
                });
            }

            res.status(200).json({
                success: true,
                data: { organization }
            });
        } catch (error) {
            next(error);
        }
    }

    async updateOrganization(req, res, next) {
        try {
            const organizationId = req.params.id;
            const { name, description, subscriptionTier, metadata, isActive } = req.body;

            const context = {
                userId: req.user.userId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            };

            const organization = await organizationService.updateOrganization(
                organizationId,
                { name, description, subscriptionTier, metadata, isActive },
                context
            );

            res.status(200).json({
                success: true,
                message: 'Organization updated successfully',
                data: { organization }
            });
        } catch (error) {
            next(error);
        }
    }

    async deleteOrganization(req, res, next) {
        try {
            const organizationId = req.params.id;

            const context = {
                userId: req.user.userId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            };

            await organizationService.deleteOrganization(organizationId, context);

            res.status(200).json({
                success: true,
                message: 'Organization deleted successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    async getOrganizationStats(req, res, next) {
        try {
            const organizationId = req.params.id;

            const stats = await organizationService.getOrganizationStats(organizationId);

            res.status(200).json({
                success: true,
                data: { stats }
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new OrganizationController();
