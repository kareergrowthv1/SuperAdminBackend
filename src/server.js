const app = require('./app');
const config = require('./config');
const db = require('./config/db');
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
    } catch (error) {
        console.error('[Server] Fatal error during startup:', error);
        process.exit(1);
    }
};

startServer();
