const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const swaggerDocument = require('./docs/swagger');
const serviceAuth = require('./middlewares/serviceAuth.middleware');
const errorMiddleware = require('./middlewares/error.middleware');
const adminRoutes = require('./routes/admins');
const dashboardRoutes = require('./routes/dashboard');
const syncRoutes = require('./routes/sync');
const paymentRoutes = require('./routes/payments');
const subscriptionRoutes = require('./routes/subscriptions');
const creditsRoutes = require('./routes/credits');
const settingsRoutes = require('./routes/settings');
const plansRoutes = require('./routes/plans');
const jobRoutes = require('./routes/jobRoutes');
const adminPlansRoutes = require('./routes/admin_plans');
const discountsRoutes = require('./routes/discounts');
const reportLevelsRoutes = require('./routes/report_levels');
const resumeTemplatesRoutes = require('./routes/resumeTemplates');

// Auth service (merged): load services so globals are set, then routes
require('./authService/services');
const authRoutes = require('./authService/routes/auth');
const userRoutes = require('./authService/routes/users');
const roleRoutes = require('./authService/routes/roles');
const permissionRoutes = require('./authService/routes/permissions');
const organizationFeaturesRoutes = require('./authService/routes/organizationFeatures');
const authHealthRoutes = require('./authService/routes/health');
const githubAuthRoutes = require('./authService/routes/github');
const googleAuthRoutes = require('./authService/routes/google');
const microsoftAuthRoutes = require('./authService/routes/microsoft');
const linkedinAuthRoutes = require('./authService/routes/linkedin');
const authController = require('./authService/controllers/authController');
const rateLimitMiddleware = require('./authService/middleware/rateLimit.middleware');

const app = express();

const MYSQL_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/;
const TIMESTAMP_KEYS = new Set(['createdAt', 'updatedAt', 'created_at', 'updated_at']);

function normalizeApiTimestamps(value, parentKey = '') {
    if (value == null) return value;

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.map((item) => normalizeApiTimestamps(item));
    }

    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = normalizeApiTimestamps(v, k);
        }
        return out;
    }

    if (typeof value === 'string' && TIMESTAMP_KEYS.has(parentKey) && MYSQL_DATETIME_RE.test(value)) {
        // Normalize MySQL datetime text to explicit UTC ISO string.
        return `${value.replace(' ', 'T')}Z`;
    }

    return value;
}

// Render/Cloud proxies terminate TLS before Node; trust proxy so req.secure is accurate.
app.set('trust proxy', 1);

// CORS: from .env (comma-separated CORS_ORIGINS); fallback for dev when empty
const DEFAULT_CORS_ORIGINS = [
    'http://localhost:4000', 'http://localhost:4001', 'http://localhost:4002', 'http://localhost:4003',
    'http://localhost:5173', 'http://localhost:5174',
    'https://localhost:4000', 'https://localhost:4001', 'https://localhost:4002', 'https://localhost:4003',
    'https://localhost:5173', 'https://localhost:5174',
    'http://127.0.0.1:4000', 'http://127.0.0.1:4001', 'http://127.0.0.1:4002', 'http://127.0.0.1:4003',
    'http://127.0.0.1:5173', 'http://127.0.0.1:5174',
    'https://127.0.0.1:4000', 'https://127.0.0.1:4001', 'https://127.0.0.1:4002', 'https://127.0.0.1:4003',
    'https://127.0.0.1:5173', 'https://127.0.0.1:5174',
];
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const originList = corsOrigins.length > 0 ? corsOrigins : DEFAULT_CORS_ORIGINS;

function isLocalDevOrigin(origin) {
    try {
        const u = new URL(origin);
        const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
        const isFrontendPort = [4000, 4001, 4002, 4003, 5173, 5174].includes(port);
        if (!isFrontendPort) return false;

        const host = u.hostname;
        const isLocalHost = host === 'localhost' || host === '127.0.0.1';
        const isLanHost =
            /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
            /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
            /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host);

        return isLocalHost || isLanHost;
    } catch (_) {
        return false;
    }
}

app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // same-origin or tools (e.g. Postman)
        if (originList.includes(origin) || isLocalDevOrigin(origin)) return cb(null, true);
        return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type', 'Authorization', 'Accept', 'X-Requested-With',
        'X-Service-Token', 'X-Service-Name', 'X-User-Id', 'X-User-Email', 'X-User-Roles',
        'X-Tenant-Id', 'X-XSRF-Token', 'X-CSRF-TOKEN',
    ],
    exposedHeaders: ['X-Token-Refreshed', 'X-Logged-Out', 'X-User-ID'],
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

// Ensure consistent timestamp serialization for all API responses.
app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (payload) => originalJson(normalizeApiTimestamps(payload));
    next();
});

// Swagger Documentation
const swaggerUiOptions = {
    customCss: `
        .swagger-ui .topbar { background-color: #d32f2f; }
        .swagger-ui .info .title { color: #d32f2f; }
        .swagger-ui .btn.authorize { background-color: #d32f2f; border-color: #d32f2f; }
        .swagger-ui .btn.authorize svg { fill: #fff; }
    `,
    customSiteTitle: 'Superadmin Backend API Documentation',
    swaggerOptions: {
        operationsSorter: (a, b) => {
            const order = { post: 0, get: 1, put: 2, patch: 3, delete: 4 };
            const methodA = a.get('method');
            const methodB = b.get('method');
            return (order[methodA] ?? 99) - (order[methodB] ?? 99);
        }
    }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerUiOptions));
app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerDocument);
});

// Health: use auth health router (GET /health, GET /ready)
app.use('/', authHealthRoutes);

// Public auth: refresh token (no X-Service-Token required; gateway calls this with cookie)
const publicAuthRouter = express.Router();
publicAuthRouter.post('/refresh', rateLimitMiddleware.auth, (req, res, next) => authController.refreshToken(req, res, next));
publicAuthRouter.use('/github', githubAuthRoutes);
publicAuthRouter.use('/google', googleAuthRoutes);
publicAuthRouter.use('/microsoft', microsoftAuthRoutes);
publicAuthRouter.use('/linkedin', linkedinAuthRoutes);
app.use('/auth-session', publicAuthRouter);

app.use(serviceAuth(config.service.internalToken));

// Auth service routes (login, logout, me, users, roles, permissions, organization-features)
app.use('/auth-session', authRoutes);
app.use('/users', userRoutes);
app.use('/roles', roleRoutes);
app.use('/permissions', permissionRoutes);
app.use('/organization-features', organizationFeaturesRoutes);

// SuperadminFrontend expects /superadmin/* – mount under /superadmin
app.use('/superadmin/admins', adminRoutes);
app.use('/superadmin/dashboard', dashboardRoutes);
app.use('/superadmin/sync', syncRoutes);
app.use('/superadmin/payments', paymentRoutes);
app.use('/superadmin/subscriptions', subscriptionRoutes);
app.use('/superadmin/credits', creditsRoutes);
app.use('/superadmin/settings', settingsRoutes);
app.use('/superadmin/plans', plansRoutes);
app.use('/superadmin/admin-plans', adminPlansRoutes);
app.use('/superadmin/discounts', discountsRoutes);
app.use('/superadmin/jobs', jobRoutes);
app.use('/superadmin/report-levels', reportLevelsRoutes);
app.use('/superadmin/resume', resumeTemplatesRoutes);


app.use(errorMiddleware);

module.exports = app;
