// XSRF Validation Middleware - Validates XSRF tokens for state-changing requests
const xsrfUtils = require('../utils/xsrfUtils');
const logger = require('../utils/logger');
const config = require('../config');

const xsrfValidationMiddleware = async (req, res, next) => {
    try {
        // Skip XSRF validation if disabled
        if (!config.features.enableXsrfProtection) {
            return next();
        }

        // Only validate for state-changing methods
        const stateMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
        if (!stateMethods.includes(req.method)) {
            return next();
        }

        // Skip for public routes (login, register, etc.)
        const publicRoutes = ['/auth-session/login', '/auth-session/register', '/auth-session/refresh'];
        if (publicRoutes.some(route => req.path.includes(route))) {
            return next();
        }

        // Extract XSRF token
        const token = xsrfUtils.extractXSRFToken(req);

        if (!token) {
            logger.warn('XSRF token missing', {
                method: req.method,
                path: req.path,
                userId: req.user?.userId
            });
            return res.status(403).json({
                success: false,
                message: 'XSRF token required for this operation',
                code: 'XSRF_TOKEN_MISSING'
            });
        }

        // Validate double-submit cookie if enabled
        if (config.xsrf.doubleSubmit && !xsrfUtils.validateDoubleSubmit(req)) {
            logger.warn('XSRF double-submit validation failed', {
                method: req.method,
                path: req.path,
                userId: req.user?.userId
            });
            return res.status(403).json({
                success: false,
                message: 'XSRF token validation failed',
                code: 'XSRF_VALIDATION_FAILED'
            });
        }

        // Verify token
        const context = {
            userId: req.user?.userId,
            organizationId: req.tenantId,
            sessionId: req.sessionID,
            requestId: req.requestId
        };

        await xsrfUtils.verifyXSRFToken(token, context);

        next();
    } catch (error) {
        logger.error('XSRF validation error', {
            error: error.message,
            method: req.method,
            path: req.path
        });

        res.status(403).json({
            success: false,
            message: error.message || 'XSRF validation failed',
            code: 'XSRF_VALIDATION_ERROR'
        });
    }
};

module.exports = xsrfValidationMiddleware;
