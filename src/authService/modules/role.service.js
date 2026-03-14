const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

class RoleService {
    normalizeCode(value) {
        if (!value) return null;
        return value.toString().trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }

    async getRoles(organizationId) {
        try {
            const sql = `SELECT r.*, (SELECT COUNT(*) FROM users WHERE role_id = r.id AND deleted_at IS NULL) as user_count FROM roles r WHERE r.organization_id = ? AND r.deleted_at IS NULL ORDER BY r.created_at DESC`;
            const roles = await db.query(sql, [organizationId]);

            if (roles.length === 0) {
                return roles;
            }

            const roleIds = roles.map(role => role.id);
            const permissionsRows = await db.query(
                `SELECT rfp.role_id, f.id as feature_id, f.name as feature_name, f.feature_key, rfp.permissions
                 FROM role_feature_permissions rfp
                 INNER JOIN features f ON rfp.feature_id = f.id
                 WHERE rfp.role_id IN (${roleIds.map(() => '?').join(',')})`,
                roleIds
            );

            const permissionsByRole = new Map();
            for (const row of permissionsRows) {
                if (!permissionsByRole.has(row.role_id)) {
                    permissionsByRole.set(row.role_id, []);
                }
                permissionsByRole.get(row.role_id).push({
                    feature_id: row.feature_id,
                    feature_name: row.feature_name,
                    feature_key: row.feature_key,
                    permissions: row.permissions
                });
            }

            for (const role of roles) {
                role.permissions = permissionsByRole.get(role.id) || [];
            }

            return roles;
        } catch (error) {
            logger.error('Get roles failed', { error: error.message });
            throw error;
        }
    }

    async getRoleById(roleId, organizationId) {
        try {
            let roles = await db.query('SELECT * FROM roles WHERE id = ? AND organization_id = ? AND deleted_at IS NULL', [roleId, organizationId]);
            if (roles.length === 0) {
                roles = await db.query('SELECT * FROM roles WHERE id = ? AND deleted_at IS NULL', [roleId]);
            }
            if (roles.length === 0) return null;

            const role = roles[0];
            const permissions = await db.query(`SELECT f.id as feature_id, f.name as feature_name, f.feature_key, rfp.permissions FROM role_feature_permissions rfp INNER JOIN features f ON rfp.feature_id = f.id WHERE rfp.role_id = ?`, [roleId]);
            role.permissions = permissions;
            return role;
        } catch (error) {
            logger.error('Get role by ID failed', { error: error.message });
            throw error;
        }
    }

    async createRole(roleData, context = {}) {
        try {
            const { name, description, organizationId, code } = roleData;
            const roleCode = this.normalizeCode(code || name);
            if (!roleCode) throw new Error('Role code is required');

            const existingRoles = await db.query('SELECT id FROM roles WHERE (name = ? OR code = ?) AND organization_id = ? AND deleted_at IS NULL', [name, roleCode, organizationId]);
            if (existingRoles.length > 0) throw new Error('Role name already exists');

            const roleId = uuidv4();
            await db.query(`INSERT INTO roles (id, organization_id, code, name, description, version, created_at) VALUES (?, ?, ?, ?, ?, 1, NOW())`, [roleId, organizationId, roleCode, name, description || null]);

            await auditService.log({ organizationId, userId: context.userId, action: 'CREATE', resourceType: 'ROLE', resourceId: roleId, newValues: { code: roleCode, name, description }, ipAddress: context.ipAddress, userAgent: context.userAgent, requestId: context.requestId, status: 'SUCCESS' });
            logger.info('Role created', { roleId, name, organizationId });
            return await this.getRoleById(roleId, organizationId);
        } catch (error) {
            logger.error('Create role failed', { error: error.message });
            throw error;
        }
    }

    async updateRole(roleId, updateData, context = {}) {
        try {
            const { name, description, organizationId, code } = updateData;
            const roleCode = this.normalizeCode(code);
            const oldRole = await this.getRoleById(roleId, organizationId);
            if (!oldRole) throw new Error('Role not found');

            const updates = [];
            const params = [];

            if (name !== undefined) {
                const existingRoles = await db.query('SELECT id FROM roles WHERE name = ? AND organization_id = ? AND id != ? AND deleted_at IS NULL', [name, organizationId, roleId]);
                if (existingRoles.length > 0) throw new Error('Role name already exists');
                updates.push('name = ?');
                params.push(name);
            }

            if (roleCode !== undefined && roleCode !== null) {
                const existingCodes = await db.query('SELECT id FROM roles WHERE code = ? AND organization_id = ? AND id != ? AND deleted_at IS NULL', [roleCode, organizationId, roleId]);
                if (existingCodes.length > 0) throw new Error('Role code already exists');
                updates.push('code = ?');
                params.push(roleCode);
            }

            if (description !== undefined) { updates.push('description = ?'); params.push(description); }
            if (updates.length === 0) return oldRole;

            updates.push('updated_at = NOW()');
            params.push(roleId, organizationId);

            await db.query(`UPDATE roles SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`, params);
            await auditService.log({ organizationId, userId: context.userId, action: 'UPDATE', resourceType: 'ROLE', resourceId: roleId, oldValues: oldRole, newValues: { ...updateData, code: roleCode || updateData.code }, ipAddress: context.ipAddress, userAgent: context.userAgent, requestId: context.requestId, status: 'SUCCESS' });
            logger.info('Role updated', { roleId, organizationId });
            return await this.getRoleById(roleId, organizationId);
        } catch (error) {
            logger.error('Update role failed', { error: error.message });
            throw error;
        }
    }

    async deleteRole(roleId, organizationId, context = {}) {
        try {
            const role = await this.getRoleById(roleId, organizationId);
            if (!role) throw new Error('Role not found');

            const users = await db.query('SELECT id FROM users WHERE role_id = ? AND deleted_at IS NULL', [roleId]);
            if (users.length > 0) throw new Error('Cannot delete role: currently assigned to users');

            await db.query('UPDATE roles SET deleted_at = NOW() WHERE id = ? AND organization_id = ?', [roleId, organizationId]);
            await this.incrementRoleVersion(roleId);
            await auditService.log({ organizationId, userId: context.userId, action: 'DELETE', resourceType: 'ROLE', resourceId: roleId, oldValues: role, ipAddress: context.ipAddress, userAgent: context.userAgent, requestId: context.requestId, status: 'SUCCESS' });
            logger.info('Role deleted', { roleId, organizationId });
        } catch (error) {
            logger.error('Delete role failed', { error: error.message });
            throw error;
        }
    }

    async incrementRoleVersion(roleId) {
        try {
            await db.query('UPDATE roles SET version = version + 1 WHERE id = ?', [roleId]);
            const rows = await db.query('SELECT version, organization_id FROM roles WHERE id = ?', [roleId]);

            if (rows.length > 0) {
                const role = rows[0];
                const cacheKey = `role:version:${roleId}:${role.organization_id || 'platform'}`;
                await redis.set(cacheKey, String(role.version), 86400);
            }

            const pattern = `permissions:role:${roleId}:*`;
            await redis.deletePattern(pattern);
            logger.info('Role version incremented', { roleId });
        } catch (error) {
            logger.error('Increment role version failed', { error: error.message });
        }
    }
}

module.exports = RoleService;
