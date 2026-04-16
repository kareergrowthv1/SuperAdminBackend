const path = require('path');
const dotenv = require('dotenv');

// Always load base env first.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Load local overrides only for local development.
// In hosted environments (Render/etc.) or production, never apply .env.local.
const isHostedRuntime = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
if (!isHostedRuntime && !isProduction) {
    dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), override: true });
}

const config = {
    env: process.env.NODE_ENV,
    port: parseInt(process.env.PORT, 10),
    logLevel: process.env.LOG_LEVEL,

    database: {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        name: process.env.DB_NAME,
        poolSize: parseInt(process.env.DB_POOL_SIZE, 10)
    },

    authDatabase: {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        name: process.env.AUTH_DB_NAME,
        poolSize: parseInt(process.env.DB_POOL_SIZE, 10)
    },

    adminBackendUrl: process.env.ADMIN_BACKEND_URL,
    authServiceUrl: process.env.AUTH_SERVICE_URL,
    candidateServiceUrl: process.env.CANDIDATE_SERVICE_URL,
    apiGatewayUrl: process.env.API_GATEWAY_URL,
    streamingServiceUrl: process.env.STREAMING_SERVICE_URL,
    aiServiceUrl: process.env.AI_SERVICE_URL,

    service: {
        internalToken: process.env.INTERNAL_SERVICE_TOKEN,
        serviceName: process.env.SERVICE_NAME,
        allowedServices: (process.env.ALLOWED_SERVICES || '').split(',').map(s => s.trim()).filter(Boolean)
    },

    jwt: {
        secret: process.env.JWT_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        expirationMinutes: parseInt(process.env.JWT_EXPIRATION_MINUTES, 10),
        refreshExpirationDays: parseInt(process.env.JWT_REFRESH_EXPIRATION_DAYS, 10),
        algorithm: process.env.JWT_ALGORITHM
    },
    redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT, 10),
        db: parseInt(process.env.REDIS_DB, 10)
    },
    xsrf: {
        tokenExpiryMinutes: parseInt(process.env.XSRF_TOKEN_EXPIRY_MINUTES, 10),
        doubleSubmit: process.env.XSRF_DOUBLE_SUBMIT === 'true',
        secret: process.env.XSRF_SECRET
    },
    loginAttempts: {
        maxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS, 10),
        lockoutDurationMinutes: parseInt(process.env.LOGIN_LOCKOUT_DURATION_MINUTES, 10),
        attemptWindowMinutes: parseInt(process.env.LOGIN_ATTEMPT_WINDOW_MINUTES, 10)
    },
    session: {
        secret: process.env.SESSION_SECRET,
        maxAgeMinutes: parseInt(process.env.SESSION_MAX_AGE_MINUTES, 10),
        cookieName: process.env.SESSION_COOKIE_NAME
    },
    security: {
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10),
        rateLimitWindowMinutes: parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10),
        rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10)
    },
    features: {
        enableAuditLogging: process.env.ENABLE_AUDIT_LOGGING === 'true',
        enableLoginAttemptTracking: process.env.ENABLE_LOGIN_ATTEMPT_TRACKING !== 'false',
        enableXsrfProtection: process.env.ENABLE_XSRF_PROTECTION !== 'false',
        enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false'
    },
    github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackUrl: process.env.GITHUB_CALLBACK_URL
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackUrl: process.env.GOOGLE_CALLBACK_URL,
    },
    microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
        callbackUrl: process.env.MICROSOFT_CALLBACK_URL,
    },
    linkedin: {
        clientId: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
        callbackUrl: process.env.LINKEDIN_CALLBACK_URL,
    },
};

module.exports = config;
