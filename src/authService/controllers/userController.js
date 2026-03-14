const { userService, loginAttemptService } = require('../services');
const logger = require('../utils/logger');

class UserController {
    async getUsers(req, res, next) {
        try {
            const organizationId = req.params.orgId || req.user.organizationId;

            const users = await userService.getUsers(organizationId);

            res.status(200).json({
                success: true,
                message: 'Users retrieved successfully',
                data: {
                    users,
                    count: users.length
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async getUserById(req, res, next) {
        try {
            const userId = req.params.id || req.query.id;
            const organizationId = req.params.orgId || req.user.organizationId;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
            }

            const user = await userService.getUserById(userId, organizationId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'User retrieved successfully',
                data: { user }
            });
        } catch (error) {
            next(error);
        }
    }

    async createUser(req, res, next) {
        try {
            const { email, password, firstName, lastName, phoneNumber, roleId } = req.body;
            const organizationId = req.params.orgId || req.user.organizationId;

            const context = {
                userId: req.user.userId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            };

            const user = await userService.createUser({
                email,
                password,
                firstName,
                lastName,
                phoneNumber,
                roleId,
                organizationId
            }, context);

            res.status(201).json({
                success: true,
                message: 'User created successfully',
                data: { user }
            });
        } catch (error) {
            next(error);
        }
    }

    async updateUser(req, res, next) {
        try {
            const userId = req.params.id;
            const { firstName, lastName, phoneNumber, roleId, isActive } = req.body;
            const organizationId = req.params.orgId || req.user.organizationId;

            const context = {
                userId: req.user.userId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            };

            const user = await userService.updateUser(userId, {
                firstName,
                lastName,
                phoneNumber,
                roleId,
                isActive,
                organizationId
            }, context);

            res.status(200).json({
                success: true,
                message: 'User updated successfully',
                data: { user }
            });
        } catch (error) {
            next(error);
        }
    }

    async deleteUser(req, res, next) {
        try {
            const userId = req.params.id;
            const organizationId = req.params.orgId || req.user.organizationId;

            const context = {
                userId: req.user.userId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            };

            await userService.deleteUser(userId, organizationId, context);

            res.status(200).json({
                success: true,
                message: 'User deleted successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    async unlockUser(req, res, next) {
        try {
            const userId = req.params.id;
            const organizationId = req.params.orgId || req.user.organizationId;

            await loginAttemptService.adminUnlock(organizationId, userId);

            res.status(200).json({
                success: true,
                message: 'User account unlocked successfully'
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new UserController();
