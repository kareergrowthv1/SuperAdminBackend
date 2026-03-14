const jwt = require('jsonwebtoken');

const PUBLIC_AUTH_PATHS = [
    '/auth-session/login',
    '/auth-session/register',
    '/auth-session/refresh',
    '/auth-session/candidate/login',
    '/auth-session/candidate/check',
    '/auth-session/candidate/send-otp',
    '/auth-session/candidate/verify-otp',
    '/auth-session/candidate/details',
    '/auth-session/candidate/register',
    '/auth-session/candidate/forgot-password',
];

function isPublicAuthPath(path) {
    if (!path) return false;
    const p = (path.split('?')[0] || '').replace(/\/$/, '');
    return PUBLIC_AUTH_PATHS.some(publicPath => p === publicPath || p.endsWith(publicPath));
}

module.exports = (expectedToken) => (req, res, next) => {
    if (isPublicAuthPath(req.path)) {
        return next();
    }

    const serviceToken = req.headers['x-service-token'];
    const bearer = req.headers.authorization;

    if (serviceToken && serviceToken === expectedToken) {
        return next();
    }

    const secret = process.env.JWT_SECRET;
    let token = null;
    if (bearer && bearer.startsWith('Bearer ')) {
        token = bearer.slice(7);
    } else if (req.cookies && req.cookies.accessToken) {
        token = req.cookies.accessToken;
    }

    if (token && secret) {
        try {
            const decoded = jwt.verify(token, secret);
            const userId = decoded.userId || decoded.id || decoded.sub;
            const role = decoded.roleName || decoded.roleCode || decoded.role || decoded.role_code;
            req.headers['x-user-id'] = userId;
            req.headers['x-user-role'] = role;
            req.headers['x-role-id'] = decoded.roleId || decoded.role_id;
            req.headers['x-organization-id'] = decoded.organizationId || decoded.organization_id;
            req.headers['x-user-cl'] = decoded.client || decoded.tenantDb;
            req.user = {
                id: userId,
                userId,
                role,
                roleName: decoded.roleName,
                roleCode: decoded.roleCode,
                roleId: decoded.roleId || decoded.role_id,
                organizationId: decoded.organizationId || decoded.organization_id
            };
            return next();
        } catch (e) {
            return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
        }
    }

    if (!expectedToken) {
        return next();
    }

    return res.status(401).json({
        success: false,
        message: 'Unauthorized. Login required or provide a valid Bearer token / accessToken cookie.'
    });
};

