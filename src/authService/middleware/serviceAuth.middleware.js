// Service-to-Service Authentication Middleware
const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config');

function isTestBypassEnabled() {
    return process.env.NODE_ENV !== 'production' && process.env.ALLOW_INSECURE_TEST_AUTH === 'true';
}

function matchesTestServiceToken(serviceToken) {
    const testToken = process.env.TEST_SERVICE_TOKEN;
    return Boolean(testToken) && Boolean(serviceToken) && serviceToken === testToken;
}

const serviceAuthMiddleware = (req, res, next) => {
    try {
        // Extract service token from header
        const serviceToken = req.get('X-Service-Token');

        if (!serviceToken) {
            logger.warn('Service token missing', {
                ip: req.ip,
                path: req.path
            });

            return res.status(401).json({
                success: false,
                message: 'Service authentication required',
                code: 'SERVICE_TOKEN_MISSING'
            });
        }

        // Verify service token
        const expectedToken = config.service.internalToken;

        if (serviceToken !== expectedToken) {
            if (isTestBypassEnabled() && matchesTestServiceToken(serviceToken)) {
                req.headers['x-user-role'] = req.headers['x-user-role'] || 'SUPERADMIN';
                req.headers['x-user-roles'] = req.headers['x-user-roles'] || 'SUPERADMIN';
                req.service = {
                    name: req.get('X-Service-Name') || 'test-client',
                    authenticated: true,
                    testBypass: true
                };
                return next();
            }

            logger.warn('Invalid service token', {
                ip: req.ip,
                path: req.path
            });

            return res.status(401).json({
                success: false,
                message: 'Invalid service token',
                code: 'INVALID_SERVICE_TOKEN'
            });
        }

        // Check if service is allowed
        const serviceName = req.get('X-Service-Name');
        
        if (serviceName && !config.service.allowedServices.includes(serviceName)) {
            logger.warn('Service not allowed', {
                serviceName,
                ip: req.ip,
                path: req.path
            });

            return res.status(403).json({
                success: false,
                message: 'Service not authorized',
                code: 'SERVICE_NOT_AUTHORIZED'
            });
        }

        // Set service info on request
        req.service = {
            name: serviceName || 'unknown',
            authenticated: true
        };

        next();
    } catch (error) {
        logger.error('Service authentication error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Service authentication failed'
        });
    }
};

module.exports = serviceAuthMiddleware;
