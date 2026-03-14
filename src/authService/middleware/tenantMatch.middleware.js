// Tenant Match Middleware - Ensures JWT organizationId matches X-Tenant-ID header
const logger = require('../utils/logger');

const tenantMatchMiddleware = (req, res, next) => {
    try {
        // Get tenant ID from header
        const headerTenantId = req.tenantId;

        // Get organization ID from JWT
        const jwtOrganizationId = req.user?.organizationId;
        const isPlatformAdmin = req.user?.isPlatformAdmin;

        // Verify they match (Only if headerTenantId is a UUID)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isUuid = headerTenantId && uuidRegex.test(headerTenantId);

        if (isUuid && headerTenantId !== jwtOrganizationId) {
            logger.warn('Tenant mismatch detected', {
                headerTenantId,
                jwtOrganizationId,
                userId: req.user?.userId,
                requestId: req.requestId
            });

            return res.status(403).json({
                success: false,
                message: 'Tenant mismatch. Access denied.',
                code: 'TENANT_MISMATCH'
            });
        }

        next();
    } catch (error) {
        logger.error('Tenant match validation error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Tenant validation failed'
        });
    }
};

module.exports = tenantMatchMiddleware;
