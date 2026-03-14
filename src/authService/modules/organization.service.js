const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');

class OrganizationService {
    async createOrganization(orgData) {
        const connection = await db.getPool().getConnection();
        try {
            await connection.beginTransaction();
            const { name, description, subscriptionTier = 'BASIC', metadata = {}, adminEmail, adminPassword, adminFirstName, adminLastName, adminPhoneNumber } = orgData;

            const [existingOrgs] = await connection.execute('SELECT id FROM organizations WHERE name = ? AND deleted_at IS NULL', [name]);
            if (existingOrgs.length > 0) throw new Error('Organization name already exists');

            const [existingUsers] = await connection.execute('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [adminEmail]);
            if (existingUsers.length > 0) throw new Error('Admin email already exists');

            const organizationId = uuidv4();
            await connection.execute(`INSERT INTO organizations (id, name, description, subscription_tier, metadata, is_active, created_at) VALUES (?, ?, ?, ?, ?, true, NOW())`, [organizationId, name, description || null, subscriptionTier, JSON.stringify(metadata)]);
            logger.info('Organization created', { organizationId, name });

            const [adminRoles] = await connection.execute('SELECT id FROM roles WHERE name = ? AND organization_id IS NULL', ['ADMIN']);
            let adminRoleId;

            if (adminRoles.length === 0) {
                adminRoleId = uuidv4();
                await connection.execute(`INSERT INTO roles (id, organization_id, name, description, version, created_at) VALUES (?, ?, 'ADMIN', 'Organization Administrator', 1, NOW())`, [adminRoleId, organizationId]);

                const [systemAdminRole] = await connection.execute('SELECT id FROM roles WHERE name = ? AND organization_id IS NULL LIMIT 1', ['ADMIN']);
                if (systemAdminRole.length > 0) {
                    const [permissions] = await connection.execute('SELECT feature_id, permissions FROM role_feature_permissions WHERE role_id = ?', [systemAdminRole[0].id]);
                    for (const perm of permissions) {
                        await connection.execute(`INSERT INTO role_feature_permissions (id, role_id, feature_id, permissions, created_at) VALUES (?, ?, ?, ?, NOW())`, [uuidv4(), adminRoleId, perm.feature_id, perm.permissions]);
                    }
                }
            } else {
                adminRoleId = adminRoles[0].id;
            }

            const userId = uuidv4();
            const passwordHash = await bcrypt.hash(adminPassword, 12);
            await connection.execute(`INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, phone_number, role_id, is_active, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, true, true, NOW())`, [userId, organizationId, adminEmail, passwordHash, adminFirstName, adminLastName, adminPhoneNumber || null, adminRoleId]);
            logger.info('Admin user created', { userId, email: adminEmail, organizationId });

            await organizationFeaturesService.initializeDefaultFeatures(organizationId);
            await connection.commit();

            return {
                organization: { id: organizationId, name, description, subscriptionTier, isActive: true },
                admin: { id: userId, email: adminEmail, firstName: adminFirstName, lastName: adminLastName, roleId: adminRoleId }
            };
        } catch (error) {
            await connection.rollback();
            logger.error('Create organization failed', { error: error.message });
            throw error;
        } finally {
            connection.release();
        }
    }

    async getAllOrganizations() {
        try {
            const sql = `SELECT o.id, o.name, o.description, o.subscription_tier, o.is_active, o.metadata, o.created_at, o.updated_at, (SELECT COUNT(*) FROM users WHERE organization_id = o.id AND deleted_at IS NULL) as user_count, (SELECT COUNT(*) FROM roles WHERE organization_id = o.id AND deleted_at IS NULL) as role_count FROM organizations o WHERE o.deleted_at IS NULL ORDER BY o.created_at DESC`;
            return await db.query(sql);
        } catch (error) {
            logger.error('Get all organizations failed', { error: error.message });
            throw error;
        }
    }

    async getOrganizationById(organizationId) {
        try {
            const sql = `SELECT o.*, (SELECT COUNT(*) FROM users WHERE organization_id = o.id AND deleted_at IS NULL) as user_count, (SELECT COUNT(*) FROM roles WHERE organization_id = o.id AND deleted_at IS NULL) as role_count FROM organizations o WHERE o.id = ? AND o.deleted_at IS NULL`;
            const orgs = await db.query(sql, [organizationId]);
            return orgs.length === 0 ? null : orgs[0];
        } catch (error) {
            logger.error('Get organization by ID failed', { error: error.message });
            throw error;
        }
    }

    async updateOrganization(organizationId, updateData, context = {}) {
        try {
            const { name, description, subscriptionTier, metadata, isActive } = updateData;
            const oldOrg = await this.getOrganizationById(organizationId);
            if (!oldOrg) throw new Error('Organization not found');

            const updates = [];
            const params = [];

            if (name !== undefined) {
                const existing = await db.query('SELECT id FROM organizations WHERE name = ? AND id != ? AND deleted_at IS NULL', [name, organizationId]);
                if (existing.length > 0) throw new Error('Organization name already exists');
                updates.push('name = ?');
                params.push(name);
            }
            if (description !== undefined) { updates.push('description = ?'); params.push(description); }
            if (subscriptionTier !== undefined) { updates.push('subscription_tier = ?'); params.push(subscriptionTier); }
            if (metadata !== undefined) { updates.push('metadata = ?'); params.push(JSON.stringify(metadata)); }
            if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive); }
            if (updates.length === 0) return oldOrg;

            updates.push('updated_at = NOW()');
            params.push(organizationId);

            const sql = `UPDATE organizations SET ${updates.join(', ')} WHERE id = ?`;
            await db.query(sql, params);

            await auditService.log({ organizationId, userId: context.userId, action: 'UPDATE', resourceType: 'ORGANIZATION', resourceId: organizationId, oldValues: oldOrg, newValues: updateData, ipAddress: context.ipAddress, userAgent: context.userAgent, requestId: context.requestId, status: 'SUCCESS' });
            logger.info('Organization updated', { organizationId });
            return await this.getOrganizationById(organizationId);
        } catch (error) {
            logger.error('Update organization failed', { error: error.message });
            throw error;
        }
    }

    async deleteOrganization(organizationId, context = {}) {
        try {
            const org = await this.getOrganizationById(organizationId);
            if (!org) throw new Error('Organization not found');

            await db.query('UPDATE organizations SET deleted_at = NOW(), is_active = false WHERE id = ?', [organizationId]);
            await auditService.log({ organizationId, userId: context.userId, action: 'DELETE', resourceType: 'ORGANIZATION', resourceId: organizationId, oldValues: org, ipAddress: context.ipAddress, userAgent: context.userAgent, requestId: context.requestId, status: 'SUCCESS' });
            logger.info('Organization deleted', { organizationId });
        } catch (error) {
            logger.error('Delete organization failed', { error: error.message });
            throw error;
        }
    }

    async getOrganizationStats(organizationId) {
        try {
            const stats = { users: {}, roles: {}, features: {}, recentActivity: [] };
            const userStats = await db.query(`SELECT COUNT(*) as total, SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active, SUM(CASE WHEN is_active = false THEN 1 ELSE 0 END) as inactive, SUM(CASE WHEN email_verified = true THEN 1 ELSE 0 END) as verified FROM users WHERE organization_id = ? AND deleted_at IS NULL`, [organizationId]);
            stats.users = userStats[0];

            const roleStats = await db.query(`SELECT COUNT(*) as total FROM roles WHERE organization_id = ? AND deleted_at IS NULL`, [organizationId]);
            stats.roles = roleStats[0];

            const featureStats = await db.query(`SELECT COUNT(*) as total, SUM(CASE WHEN is_enabled = true THEN 1 ELSE 0 END) as enabled, SUM(CASE WHEN is_enabled = false THEN 1 ELSE 0 END) as disabled FROM organization_features WHERE organization_id = ?`, [organizationId]);
            stats.features = featureStats[0];

            const recentActivity = await db.query(`SELECT action, resource_type, created_at, (SELECT CONCAT(first_name, ' ', last_name) FROM users WHERE id = audit_logs.user_id) as user_name FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 10`, [organizationId]);
            stats.recentActivity = recentActivity;

            return stats;
        } catch (error) {
            logger.error('Get organization stats failed', { error: error.message });
            throw error;
        }
    }
}

module.exports = OrganizationService;
