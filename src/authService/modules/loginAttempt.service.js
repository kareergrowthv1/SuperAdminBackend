const db = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const config = require('../config');

class LoginAttemptService {
    async checkLoginAttempts(organizationId, email) {
        try {
            const key = `login:attempts:${organizationId}:${email}`;
            const attempts = await redis.get(key);

            if (!attempts) return { allowed: true, remainingAttempts: config.loginAttempts.maxAttempts };

            if (attempts.lockedUntil && new Date(attempts.lockedUntil) > new Date()) {
                const secondsRemaining = Math.ceil((new Date(attempts.lockedUntil) - new Date()) / 1000);
                return { allowed: false, locked: true, secondsRemaining, message: `Account locked. Try again in ${Math.ceil(secondsRemaining / 60)} minutes` };
            }

            if (attempts.count >= config.loginAttempts.maxAttempts) {
                const lockDuration = config.loginAttempts.lockoutDurationMinutes * 60 * 1000;
                attempts.lockedUntil = new Date(Date.now() + lockDuration).toISOString();
                await redis.set(key, attempts, config.loginAttempts.attemptWindowMinutes * 60);
                return { allowed: false, locked: true, message: `Account locked due to too many failed attempts. Try again in ${config.loginAttempts.lockoutDurationMinutes} minutes` };
            }

            return { allowed: true, remainingAttempts: config.loginAttempts.maxAttempts - attempts.count };
        } catch (error) {
            logger.error('Check login attempts failed', { error: error.message });
            return { allowed: true, remainingAttempts: config.loginAttempts.maxAttempts };
        }
    }

    async recordFailedAttempt(organizationId, email, ipAddress, userAgent) {
        try {
            const key = `login:attempts:${organizationId}:${email}`;
            let attempts = await redis.get(key);

            if (!attempts) {
                attempts = { count: 1, firstAttemptAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString(), lockedUntil: null, ipAddresses: [ipAddress] };
            } else {
                attempts.count += 1;
                attempts.lastAttemptAt = new Date().toISOString();
                if (!attempts.ipAddresses.includes(ipAddress)) attempts.ipAddresses.push(ipAddress);
            }

            const ttl = config.loginAttempts.attemptWindowMinutes * 60;
            await redis.set(key, attempts, ttl);
            logger.warn('Failed login attempt recorded', { email, organizationId, attemptCount: attempts.count, ipAddress });
        } catch (error) {
            logger.error('Record failed attempt error', { error: error.message });
        }
    }

    async recordSuccessfulLogin(organizationId, email) {
        try {
            const key = `login:attempts:${organizationId}:${email}`;
            await redis.del(key);
            logger.info('Login attempts cleared', { email, organizationId });
        } catch (error) {
            logger.error('Clear login attempts failed', { error: error.message });
        }
    }

    async adminUnlock(organizationId, userId) {
        try {
            const users = await db.query('SELECT email FROM users WHERE id = ? AND organization_id = ?', [userId, organizationId]);
            if (users.length === 0) throw new Error('User not found');

            const email = users[0].email;
            const key = `login:attempts:${organizationId}:${email}`;
            await redis.del(key);
            await db.query('UPDATE users SET account_locked = false, login_attempts_count = 0 WHERE id = ?', [userId]);
            logger.info('Account unlocked by admin', { userId, email });
            return true;
        } catch (error) {
            logger.error('Admin unlock failed', { error: error.message });
            throw error;
        }
    }
}

module.exports = LoginAttemptService;
