const { roleService } = require('../services');
const logger = require('../utils/logger');

class RoleController {
    async getRoles(req, res, next) {
        try {
            const organizationId = req.params.orgId || req.user.organizationId;

            const roles = await roleService.getRoles(organizationId);

            res.status(200).json({
                success: true,
                message: 'Roles retrieved successfully',
                data: {
                    roles,
                    count: roles.length
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async getRoleById(req, res, next) {
        try {
            const roleId = req.params.id;
            const organizationId = req.params.orgId || req.user.organizationId;

            const role = await roleService.getRoleById(roleId, organizationId);

            if(!role) {
                return res.status(404).json({
                    success: false,
                    message: 'Role not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Role retrieved successfully',
                data: { role }
            });
        } catch (error) {
            next(error);
        }
    }

    async createRole(req, res, next) {
        try {
            const { name, description, code } = req.body;
            const organizationId = req.params.orgId || req.user.organizationId;

            const context = {
                userId: req.user.userId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            };

            const role = await roleService.createRole({
                name,
                description,
                code,
                organizationId
            }, context);

            res.status(201).json({
                success: true,
                message: 'Role created successfully',
                data: { role }
            });
        } catch (error) {
            next(error);
        }
    }

    async updateRole(req, res, next) {
        try {
            const roleId = req.params.id;
            const { name, description, code } = req.body;
            const organizationId = req.params.orgId || req.user.organizationId;

            const context = {
                userId: req.user.userId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            };

            const role = await roleService.updateRole(roleId, {
                name,
                description,
                code,
                organizationId
            }, context);

            res.status(200).json({
                success: true,
                message: 'Role updated successfully',
                data: { role }
            });
        } catch (error) {
            next(error);
        }
    }

    async deleteRole(req, res, next) {
        try {
            const roleId = req.params.id;
            const organizationId = req.params.orgId || req.user.organizationId;

            const context = {
                userId: req.user.userId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            };

            await roleService.deleteRole(roleId, organizationId, context);

            res.status(200).json({
                success: true,
                message: 'Role deleted successfully'
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new RoleController();
