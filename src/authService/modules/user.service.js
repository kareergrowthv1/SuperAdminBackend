const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');

class UserService {
    async getUsers(organizationId) {
        try {
            const sql = `SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number, u.is_active, u.email_verified, u.account_locked, u.last_login_at, u.created_at, r.id as role_id, r.name as role_name FROM users u INNER JOIN roles r ON u.role_id = r.id WHERE u.organization_id = ? AND u.deleted_at IS NULL ORDER BY u.created_at DESC`;
            return await db.query(sql, [organizationId]);
        } catch (error) {
            logger.error('Get users failed', { error: error.message });
            throw error;
        }
    }

    async getUserById(userId, organizationId) {
        try {
            const sql = `SELECT u.*, r.name as role_name, r.code as role_code, r.version as role_version FROM users u INNER JOIN roles r ON u.role_id = r.id WHERE u.id = ? AND u.organization_id = ? AND u.deleted_at IS NULL`;
            const users = await db.query(sql, [userId, organizationId]);
            if (users.length === 0) return null;

            const user = users[0];

            // Cleanup redundant/internal fields
            const cleanUser = {
                id: user.id,
                organizationId: user.organization_id,
                email: user.email,
                username: user.username,
                firstName: user.first_name,
                lastName: user.last_name,
                phoneNumber: user.phone_number,
                emailVerified: !!user.email_verified,
                client: user.client,
                isEnabled: !!user.enabled,
                isSubscribed: !!user.is_subscribed,
                isHold: !!user.is_hold,
                isActive: !!user.is_active,
                isAdmin: !!user.is_admin,
                roleId: user.role_id,
                roleName: user.role_name,
                roleVersion: user.role_version,
                isCollege: user.role_code === 'ADMIN',
                lastLoginAt: user.last_login_at,
                lastLoginIp: user.last_login_ip,
                lastLoginDevice: user.last_login_device
            };

            return cleanUser;
        } catch (error) {
            logger.error('Get user by ID failed', { error: error.message });
            throw error;
        }
    }

    async createUser(userData, context = {}) {
        try {
            const { email, password, firstName, lastName, phoneNumber, roleId, organizationId } = userData;
            const existingUsers = await db.query('SELECT id FROM users WHERE email = ? AND organization_id = ? AND deleted_at IS NULL', [email, organizationId]);
            if (existingUsers.length > 0) throw new Error('Email already exists');

            const roles = await db.query('SELECT id FROM roles WHERE id = ? AND organization_id = ?', [roleId, organizationId]);
            if (roles.length === 0) throw new Error('Invalid role for organization');

            const passwordHash = await bcrypt.hash(password, 12);
            const userId = uuidv4();
            await db.query(`INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, phone_number, role_id, is_active, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, true, false, NOW())`, [userId, organizationId, email, passwordHash, firstName, lastName, phoneNumber || null, roleId]);

            await auditService.log({ organizationId, userId: context.userId, action: 'CREATE', resourceType: 'USER', resourceId: userId, newValues: { email, firstName, lastName, roleId }, ipAddress: context.ipAddress, userAgent: context.userAgent, requestId: context.requestId, status: 'SUCCESS' });
            logger.info('User created', { userId, email, organizationId });
            return await this.getUserById(userId, organizationId);
        } catch (error) {
            logger.error('Create user failed', { error: error.message });
            throw error;
        }
    }

    async updateUser(userId, updateData, context = {}) {
        try {
            const { firstName, lastName, phoneNumber, roleId, isActive, organizationId } = updateData;
            const oldUser = await this.getUserById(userId, organizationId);
            if (!oldUser) throw new Error('User not found');

            const updates = [];
            const params = [];

            if (firstName !== undefined) { updates.push('first_name = ?'); params.push(firstName); }
            if (lastName !== undefined) { updates.push('last_name = ?'); params.push(lastName); }
            if (phoneNumber !== undefined) { updates.push('phone_number = ?'); params.push(phoneNumber); }
            if (roleId !== undefined) {
                const roles = await db.query('SELECT id FROM roles WHERE id = ? AND organization_id = ?', [roleId, organizationId]);
                if (roles.length === 0) throw new Error('Invalid role for organization');
                updates.push('role_id = ?');
                params.push(roleId);
            }
            if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive); }
            if (updates.length === 0) return oldUser;

            updates.push('updated_at = NOW()');
            params.push(userId, organizationId);

            await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`, params);
            await auditService.log({ organizationId, userId: context.userId, action: 'UPDATE', resourceType: 'USER', resourceId: userId, oldValues: oldUser, newValues: updateData, ipAddress: context.ipAddress, userAgent: context.userAgent, requestId: context.requestId, status: 'SUCCESS' });
            logger.info('User updated', { userId, organizationId });
            return await this.getUserById(userId, organizationId);
        } catch (error) {
            logger.error('Update user failed', { error: error.message });
            throw error;
        }
    }

    async deleteUser(userId, organizationId, context = {}) {
        try {
            const user = await this.getUserById(userId, organizationId);
            if (!user) throw new Error('User not found');

            await db.query('UPDATE users SET deleted_at = NOW() WHERE id = ? AND organization_id = ?', [userId, organizationId]);
            await auditService.log({ organizationId, userId: context.userId, action: 'DELETE', resourceType: 'USER', resourceId: userId, oldValues: user, ipAddress: context.ipAddress, userAgent: context.userAgent, requestId: context.requestId, status: 'SUCCESS' });
            logger.info('User deleted', { userId, organizationId });
        } catch (error) {
            logger.error('Delete user failed', { error: error.message });
            throw error;
        }
    }
}

module.exports = UserService;
