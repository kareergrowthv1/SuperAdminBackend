const db = require('../config/database');
const logger = require('../utils/logger');
const { auditService } = require('../services');

const DEFAULT_INTERVAL_MINUTES = 5;

const runOnce = async () => {
    try {
        const expiredUsers = await db.query(
            `SELECT id, organization_id
             FROM users
             WHERE expiry_date IS NOT NULL
               AND expiry_date < NOW()
               AND is_active = true`,
            []
        );

        if (expiredUsers.length === 0) {
            return;
        }

        const ids = expiredUsers.map((u) => u.id);
        await db.query(
            `UPDATE users
             SET is_active = false, account_locked = true, updated_at = NOW()
             WHERE id IN (${ids.map(() => '?').join(', ')})`,
            ids
        );

        for (const user of expiredUsers) {
            await auditService.log({
                organizationId: user.organization_id,
                userId: user.id,
                action: 'USER_AUTO_EXPIRED',
                resourceType: 'USER',
                resourceId: user.id,
                status: 'SUCCESS'
            });
        }

        logger.info('User expiry job applied', { count: expiredUsers.length });
    } catch (error) {
        logger.error('User expiry job failed', { error: error.message });
    }
};

const startUserExpiryJob = () => {
    const intervalMinutes = parseInt(process.env.USER_EXPIRY_JOB_INTERVAL_MINUTES, 10)
        || DEFAULT_INTERVAL_MINUTES;
    const intervalMs = intervalMinutes * 60 * 1000;
    runOnce();
    const timer = setInterval(runOnce, intervalMs);

    logger.info('User expiry job scheduled', { intervalMinutes });
    return timer;
};

module.exports = {
    startUserExpiryJob
};
