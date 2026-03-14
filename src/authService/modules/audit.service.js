const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');

class AuditService {
    async log(auditData) {
        try {
            const { organizationId, userId, action, resourceType, resourceId, oldValues, newValues, ipAddress, userAgent, requestId, status, errorMessage } = auditData;
            const id = uuidv4();
            const sql = `INSERT INTO audit_logs (id, organization_id, user_id, action, resource_type, resource_id, old_values, new_values, ip_address, user_agent, request_id, status, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`;

            await db.query(sql, [id, organizationId, userId || null, action, resourceType || null, resourceId || null, oldValues ? JSON.stringify(oldValues) : null, newValues ? JSON.stringify(newValues) : null, ipAddress || null, userAgent || null, requestId || null, status || 'SUCCESS', errorMessage || null]);
            logger.debug('Audit log created', { id, action, resourceType });
        } catch (error) {
            logger.error('Audit log creation failed', { error: error.message, auditData });
        }
    }

    async getAuditLogs(filters = {}) {
        try {
            const { organizationId, userId, action, resourceType, startDate, endDate, limit = 100, offset = 0 } = filters;
            let sql = 'SELECT * FROM audit_logs WHERE 1=1';
            const params = [];

            if (organizationId) { sql += ' AND organization_id = ?'; params.push(organizationId); }
            if (userId) { sql += ' AND user_id = ?'; params.push(userId); }
            if (action) { sql += ' AND action = ?'; params.push(action); }
            if (resourceType) { sql += ' AND resource_type = ?'; params.push(resourceType); }
            if (startDate) { sql += ' AND created_at >= ?'; params.push(startDate); }
            if (endDate) { sql += ' AND created_at <= ?'; params.push(endDate); }

            sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);
            return await db.query(sql, params);
        } catch (error) {
            logger.error('Get audit logs failed', { error: error.message });
            throw error;
        }
    }
}

module.exports = AuditService;
