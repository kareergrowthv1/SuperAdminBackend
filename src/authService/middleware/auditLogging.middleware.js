// Audit Logging Middleware - Logs actions to database after response
const logger = require('../utils/logger');
const config = require('../config');

// Lazy load to avoid circular dependency
let auditService = null;
const getAuditService = () => {
    if (!auditService) {
        ({ auditService } = require('../services'));
    }
    return auditService;
};

const auditLoggingMiddleware = (req, res, next) => {
    // Skip if audit logging is disabled
    if (!config.features.enableAuditLogging) {
        return next();
    }

    // Hook into response finish event
    res.on('finish', async () => {
        try {
            const audit = getAuditService();
            
            // Extract action from request
            const action = determineAction(req);
            const resourceType = determineResourceType(req);
            const resourceId = extractResourceId(req);

            // Create audit log entry
            await audit.log({
                organizationId: req.auditContext?.organizationId,
                userId: req.auditContext?.userId,
                action,
                resourceType,
                resourceId,
                oldValues: req.auditContext?.oldValues || null,
                newValues: req.auditContext?.newValues || null,
                ipAddress: req.auditContext?.ip,
                userAgent: req.auditContext?.userAgent,
                requestId: req.auditContext?.requestId,
                status: req.auditContext?.status || 'SUCCESS',
                errorMessage: req.auditContext?.errorMessage || null
            });
        } catch (error) {
            logger.error('Audit logging failed', {
                error: error.message,
                requestId: req.requestId
            });
            // Don't let audit errors break the application
        }
    });

    next();
};

// Helper functions
function determineAction(req) {
    const { method, path } = req;
    
    if (path.includes('login')) return 'LOGIN';
    if (path.includes('logout')) return 'LOGOUT';
    if (path.includes('register')) return 'REGISTER';
    if (method === 'POST') return 'CREATE';
    if (method === 'PUT' || method === 'PATCH') return 'UPDATE';
    if (method === 'DELETE') return 'DELETE';
    return 'READ';
}

function determineResourceType(req) {
    const path = req.path.toLowerCase();
    if (path.includes('/users')) return 'USER';
    if (path.includes('/roles')) return 'ROLE';
    if (path.includes('/jobs')) return 'JOB';
    if (path.includes('/candidates')) return 'CANDIDATE';
    if (path.includes('/interviews')) return 'INTERVIEW';
    if (path.includes('/applications')) return 'APPLICATION';
    if (path.includes('/clients')) return 'CLIENT';
    if (path.includes('/vendors')) return 'VENDOR';
    if (path.includes('/ai-tests')) return 'AI_TEST';
    return 'UNKNOWN';
}

function extractResourceId(req) {
    // Try to extract ID from params or body
    if (req.params?.id) return req.params.id;
    if (req.body?.id) return req.body.id;
    
    // Try to extract from path
    const match = req.path.match(/\/[^/]+\/([a-f0-9-]{36})/i);
    return match ? match[1] : null;
}

module.exports = auditLoggingMiddleware;
