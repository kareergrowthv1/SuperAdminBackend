// Audit Context Middleware - Captures request context for audit logging
const { v4: uuidv4 } = require('uuid');

const auditContextMiddleware = (req, res, next) => {
    // Capture original request state
    req.auditContext = {
        requestId: req.requestId || uuidv4(),
        userId: req.user?.userId || null,
        organizationId: req.tenantId || null,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
        method: req.method,
        path: req.path,
        query: { ...req.query },
        body: req.method !== 'GET' ? { ...req.body } : undefined,
        timestamp: new Date(),
        status: 'PENDING'
    };

    // Remove sensitive data from audit body
    if (req.auditContext.body) {
        delete req.auditContext.body.password;
        delete req.auditContext.body.confirmPassword;
        delete req.auditContext.body.oldPassword;
        delete req.auditContext.body.newPassword;
    }

    // Intercept response to capture final status
    const originalSend = res.send;
    res.send = function(data) {
        req.auditContext.status = res.statusCode >= 400 ? 'FAILURE' : 'SUCCESS';
        req.auditContext.statusCode = res.statusCode;
        req.auditContext.completedAt = new Date();
        req.auditContext.duration = req.auditContext.completedAt - req.auditContext.timestamp;

        return originalSend.call(this, data);
    };

    next();
};

module.exports = auditContextMiddleware;
