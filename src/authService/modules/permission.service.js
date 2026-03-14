const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');

class PermissionService {
    async getRolePermissions(roleId, organizationId) {
        try {
            const sql = `SELECT f.id as feature_id, f.name as feature_name, f.feature_key, f.description, rfp.permissions, rfp.created_at, rfp.updated_at FROM role_feature_permissions rfp INNER JOIN features f ON rfp.feature_id = f.id INNER JOIN roles r ON rfp.role_id = r.id WHERE rfp.role_id = ? AND r.organization_id = ? ORDER BY f.name`;
            return await db.query(sql, [roleId, organizationId]);
        } catch (error) {
            logger.error('Get role permissions failed', { error: error.message });
            throw error;
        }
    }

    async getAllFeatures() {
        try {
            return await db.query('SELECT * FROM features ORDER BY name');
        } catch (error) {
            logger.error('Get all features failed', { error: error.message });
            throw error;
        }
    }

    async updateRolePermission(roleId, featureId, permissions, context = {}) {
        try {
            const { organizationId } = context;
            const roles = await db.query('SELECT id FROM roles WHERE id = ? AND organization_id = ? AND deleted_at IS NULL', [roleId, organizationId]);
            if (roles.length === 0) throw new Error('Role not found');

            const features = await db.query('SELECT id FROM features WHERE id = ?', [featureId]);
            if (features.length === 0) throw new Error('Feature not found');

            const oldPermissions = await db.query('SELECT permissions FROM role_feature_permissions WHERE role_id = ? AND feature_id = ?', [roleId, featureId]);
            const id = uuidv4();

            if (oldPermissions.length > 0) {
                await db.query('UPDATE role_feature_permissions SET permissions = ?, updated_at = NOW() WHERE role_id = ? AND feature_id = ?', [permissions, roleId, featureId]);
            } else {
                await db.query('INSERT INTO role_feature_permissions (id, role_id, feature_id, permissions, created_at) VALUES (?, ?, ?, ?, NOW())', [id, roleId, featureId, permissions]);
            }

            await roleService.incrementRoleVersion(roleId);
            await auditService.log({ organizationId, userId: context.userId, action: oldPermissions.length > 0 ? 'UPDATE' : 'CREATE', resourceType: 'PERMISSION', resourceId: `${roleId}:${featureId}`, oldValues: oldPermissions.length > 0 ? { permissions: oldPermissions[0].permissions } : null, newValues: { permissions }, ipAddress: context.ipAddress, userAgent: context.userAgent, requestId: context.requestId, status: 'SUCCESS' });
            logger.info('Role permission updated', { roleId, featureId, permissions });
        } catch (error) {
            logger.error('Update role permission failed', { error: error.message });
            throw error;
        }
    }

    async bulkUpdateRolePermissions(roleId, permissionUpdates, context = {}) {
        try {
            const { organizationId } = context;
            const roles = await db.query('SELECT id FROM roles WHERE id = ? AND organization_id = ? AND deleted_at IS NULL', [roleId, organizationId]);
            if (roles.length === 0) throw new Error('Role not found');

            for (const update of permissionUpdates) {
                await this.updateRolePermission(roleId, update.featureId, update.permissions, context);
            }
            logger.info('Bulk role permissions updated', { roleId, count: permissionUpdates.length });
        } catch (error) {
            logger.error('Bulk update role permissions failed', { error: error.message });
            throw error;
        }
    }

    async deleteRolePermission(roleId, featureId, context = {}) {
        try {
            const { organizationId } = context;
            const oldPermissions = await db.query('SELECT permissions FROM role_feature_permissions WHERE role_id = ? AND feature_id = ?', [roleId, featureId]);
            if (oldPermissions.length === 0) throw new Error('Permission not found');

            await db.query('DELETE FROM role_feature_permissions WHERE role_id = ? AND feature_id = ?', [roleId, featureId]);
            await roleService.incrementRoleVersion(roleId);
            await auditService.log({ organizationId, userId: context.userId, action: 'DELETE', resourceType: 'PERMISSION', resourceId: `${roleId}:${featureId}`, oldValues: { permissions: oldPermissions[0].permissions }, ipAddress: context.ipAddress, userAgent: context.userAgent, requestId: context.requestId, status: 'SUCCESS' });
            logger.info('Role permission deleted', { roleId, featureId });
        } catch (error) {
            logger.error('Delete role permission failed', { error: error.message });
            throw error;
        }
    }
}

module.exports = PermissionService;
