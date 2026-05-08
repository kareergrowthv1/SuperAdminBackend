const app = require('./app');
const config = require('./config');
const db = require('./config/db');
const fs = require('fs');
const https = require('https');
const { initializeSuperadminDB, initializeAuthDB } = require('./utils/initDB');
const syncService = require('./services/syncService');

const startServer = async () => {
    try {
        // Initialize auth_db (schema + migrations; auth is part of SuperadminBackend)
        await initializeAuthDB();

        // Initialize superadmin_db
        await initializeSuperadminDB();

        // Initialize DB pools (superadmin + auth)
        await db.initializePool();
        console.log('[Server] Database pools initialized');

        // Auth service: seed auth_db and start optional Redis + user-expiry job
        try {
            const dbInitializer = require('./authService/utils/dbInitializer');
            await dbInitializer.initializeDatabase();
            console.log('[Server] Auth DB seed/init complete');
        } catch (err) {
            console.warn('[Server] Auth DB initializer (non-fatal):', err.message);
        }
        try {
            const redis = require('./authService/config/redis');
            await redis.initializeRedisClient();
            if (redis.isRedisAvailable()) console.log('[Server] Redis ready');
        } catch (err) {
            console.warn('[Server] Redis unavailable (auth will run without cache):', err.message);
        }
        try {
            const { startUserExpiryJob } = require('./authService/modules/userExpiryJob');
            startUserExpiryJob();
        } catch (err) {
            console.warn('[Server] User expiry job (non-fatal):', err.message);
        }

        // Run initial credits sync
        console.log('[Server] Running initial credits sync...');
        const syncResult = await syncService.syncAllCredits();
        if (syncResult.success) {
            console.log(`[Server] ✓ Initial sync complete: ${syncResult.synced} clients synced`);
        } else {
            console.warn('[Server] ⚠ Initial sync had errors:', syncResult.error);
        }

        app.listen(config.port, () => {
            console.log(`Superadmin Backend (with Auth) running on port ${config.port}`);
        });

        // Optional HTTPS listener for LAN sharing / secure browser access.
        const sslKeyPath = process.env.SSL_KEY_PATH;
        const sslCertPath = process.env.SSL_CERT_PATH;
        const sslPfxPath = process.env.SSL_PFX_PATH;
        const sslPfxPassphrase = process.env.SSL_PFX_PASSPHRASE;
        const sslPort = Number(process.env.SSL_PORT || 0);
        let tlsOptions = null;
        if (sslPort > 0 && sslPfxPath && fs.existsSync(sslPfxPath)) {
            tlsOptions = {
                pfx: fs.readFileSync(sslPfxPath),
                passphrase: sslPfxPassphrase || undefined,
            };
        } else if (sslKeyPath && sslCertPath && sslPort > 0 && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
            tlsOptions = {
                key: fs.readFileSync(sslKeyPath),
                cert: fs.readFileSync(sslCertPath),
            };
        }
        if (tlsOptions) {
            https.createServer(tlsOptions, app).listen(sslPort, '0.0.0.0', () => {
                console.log(`Superadmin Backend HTTPS running on port ${sslPort}`);
            });
        }
    } catch (error) {
        console.error('[Server] Fatal error during startup:', error);
        process.exit(1);
    }
};

startServer();
