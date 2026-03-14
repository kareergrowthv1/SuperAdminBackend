// Tenant Validation Middleware - Extracts and validates X-Tenant-ID header
const logger = require('../utils/logger');
const jwtUtils = require('../utils/jwtUtils');

const tenantValidationMiddleware = async (req, res, next) => {
    try {
        // Extract X-Tenant-ID from header (fallback to orgId in path)
        const headerTenantId = req.get('X-Tenant-ID');
        const paramTenantId = req.params?.orgId;
        const urlMatch = req.originalUrl?.match(/\/org\/([0-9a-f-]{36})/i);
        const urlTenantId = urlMatch ? urlMatch[1] : null;
        let tenantId = headerTenantId || paramTenantId || urlTenantId;

        // Check if tenant ID is provided
        if (!tenantId) {
            // Try to extract tenantId from access token
            let token = null;
            const authHeader = req.get('Authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.slice(7);
            }

            if (!token && req.cookies?.accessToken) {
                token = req.cookies.accessToken;
            }

            if (!token && req.cookies?.access_token) {
                token = req.cookies.access_token;
            }

            if (token) {
                try {
                    const decoded = await jwtUtils.verifyAccessToken(token);
                    if (decoded?.organizationId) {
                        tenantId = decoded.organizationId;
                    }
                } catch (error) {
                    logger.warn('Failed to derive tenant from token', { error: error.message });
                }
            }

            if (tenantId) {
                req.tenantId = tenantId;
                return next();
            }

            // Allow missing tenant ID for login, refresh, and candidate portal endpoints
            const allowMissing = req.path === '/login' || req.path === '/refresh' || req.path.startsWith('/candidate/');

            if (!allowMissing) {
                return res.status(400).json({
                    success: false,
                    message: 'X-Tenant-ID header or orgId path param is required',
                    code: 'MISSING_TENANT_ID'
                });
            }

            req.tenantId = null;
            return next();
        }

        // Validate format (Allow UUID or DB Name/Alphanumeric with underscores)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const dbNameRegex = /^[a-z0-9_]+$/i;

        if (!uuidRegex.test(tenantId) && !dbNameRegex.test(tenantId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid tenant ID format. Must be a valid UUID or Database Name.',
                code: 'INVALID_TENANT_ID'
            });
        }

        // Set tenant ID on request object
        req.tenantId = tenantId;

        next();
    } catch (error) {
        logger.error('Tenant validation error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Tenant validation failed'
        });
    }
};

module.exports = tenantValidationMiddleware;
