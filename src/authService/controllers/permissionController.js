const { permissionService } = require('../services');
const logger = require('../utils/logger');

class PermissionController {
    async getAllFeatures(req, res, next) {
        try {
            const features = await permissionService.getAllFeatures();

            res.status(200).json({
                success: true,
                message: 'Features retrieved successfully',
                data: {
                    features,
                    count: features.length
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async getRolePermissions(req, res, next) {
        try {
            const roleId = req.params.roleId;
            const organizationId = req.params.orgId || req.user.organizationId;

            const permissions = await permissionService.getRolePermissions(roleId, organizationId);

            res.status(200).json({
                success: true,
                message: 'Permissions retrieved successfully',
                data: {
                    permissions,
                    count: permissions.length
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async updateRolePermission(req, res, next) {
        try {
            const roleId = req.params.roleId;
            const featureId = req.params.featureId;
            const { permissions } = req.body;
            const organizationId = req.params.orgId || req.user.organizationId;

            const context = {
                userId: req.user.userId,
                organizationId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            };

            await permissionService.updateRolePermission(roleId, featureId, permissions, context);

            res.status(200).json({
                success: true,
                message: 'Permission updated successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    async bulkUpdateRolePermissions(req, res, next) {
        try {
            const roleId = req.params.roleId;
            const { permissions } = req.body;
            const organizationId = req.params.orgId || req.user.organizationId;

            const context = {
                userId: req.user.userId,
                organizationId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            };

            await permissionService.bulkUpdateRolePermissions(roleId, permissions, context);

            res.status(200).json({
                success: true,
                message: 'Permissions updated successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    async deleteRolePermission(req, res, next) {
        try {
            const roleId = req.params.roleId;
            const featureId = req.params.featureId;
            const organizationId = req.params.orgId || req.user.organizationId;

            const context = {
                userId: req.user.userId,
                organizationId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            };

            await permissionService.deleteRolePermission(roleId, featureId, context);

            res.status(200).json({
                success: true,
                message: 'Permission deleted successfully'
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new PermissionController();
