const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const jwtUtils = require('../utils/jwtUtils');
const xsrfUtils = require('../utils/xsrfUtils');
const logger = require('../utils/logger');
const config = require('../config');
const deviceUtils = require('../utils/deviceUtils');
const otpStore = require('../utils/otpStore');
const emailService = require('../../services/emailService');

// Get database name to use as tenantId
const DB_NAME = config.database.name || process.env.DB_NAME || 'auth_db';

/** Normalize phone to digits only (strip +91, 91, spaces) for lookup */
function normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') return '';
    return phone.replace(/\D/g, '').replace(/^91(?=\d{10})/, '') || phone.replace(/\D/g, '');
}

/** Check if input looks like email */
function isEmail(input) {
    return typeof input === 'string' && input.includes('@') && input.includes('.');
}

class AuthService {
    /**
     * Find user by email or phone (auth_db.users).
     * emailOrPhone: string (email or phone number).
     */
    async findUserByEmailOrPhone(emailOrPhone) {
        if (!emailOrPhone || typeof emailOrPhone !== 'string') return null;
        const trimmed = emailOrPhone.trim();
        if (!trimmed) return null;

        if (isEmail(trimmed)) {
            const users = await db.query(
                `SELECT u.*, r.version as roleVersion, r.code as roleCode,
                        u.is_active, u.is_subscribed, u.is_hold
                 FROM users u LEFT JOIN roles r ON u.role_id = r.id
                 WHERE (u.email = ? OR u.phone_number = ?) AND u.is_active = true LIMIT 1`,
                [trimmed.toLowerCase(), trimmed]
            );
            return users.length > 0 ? users[0] : null;
        }

        const digits = normalizePhone(trimmed);
        if (!digits) return null;
        const users = await db.query(
            `SELECT u.*, r.version as roleVersion, r.code as roleCode,
                    u.is_active, u.is_subscribed, u.is_hold
             FROM users u LEFT JOIN roles r ON u.role_id = r.id
             WHERE (
                 u.email = ?
                 OR REPLACE(REPLACE(REPLACE(COALESCE(u.phone_number,''), '+', ''), ' ', ''), '-', '') = ?
                 OR REPLACE(REPLACE(REPLACE(COALESCE(u.mobile_no,''), '+', ''), ' ', ''), '-', '') = ?
             ) AND u.is_active = true LIMIT 1`,
            [trimmed, digits, digits]
        );
        return users.length > 0 ? users[0] : null;
    }

    async login(emailOrPhone, password, organizationId, context = {}) {
        try {
            const loginAttempt = loginAttemptService;
            const trimmed = (emailOrPhone || '').trim();
            if (!trimmed) {
                await loginAttempt.recordFailedAttempt('global', trimmed || 'empty', context.ipAddress, context.userAgent);
                throw new Error('Invalid credentials');
            }

            const user = await this.findUserByEmailOrPhone(trimmed);
            const users = user ? [user] : [];

            if (users.length === 0) {
                await loginAttempt.recordFailedAttempt('global', trimmed, context.ipAddress, context.userAgent);
                throw new Error('Invalid credentials');
            }

            const userOrgKey = user.organization_id || 'platform';
            const attemptKey = user.email || trimmed;

            const attemptCheck = await loginAttempt.checkLoginAttempts(userOrgKey, attemptKey);

            if (!attemptCheck.allowed) {
                throw new Error(attemptCheck.message || 'Account locked');
            }

            const passwordMatch = await bcrypt.compare(password, user.password_hash);

            if (!passwordMatch) {
                await loginAttempt.recordFailedAttempt(userOrgKey, attemptKey, context.ipAddress, context.userAgent);
                throw new Error('Invalid credentials');
            }

            if (user.roleCode !== 'SUPERADMIN') {
                if (user.account_locked) throw new Error('Account is locked. Contact administrator.');
                if (user.account_expired) throw new Error('Account has expired');
                if (!user.enabled) throw new Error('Account is disabled');
            }

            // Fetch user permissions (SUPERADMIN gets full access)
            let permissions = [];
            try {
                if (user.roleCode === 'SUPERADMIN') {
                    const featureRows = await db.query('SELECT feature_key FROM features');
                    permissions = featureRows.length > 0
                        ? featureRows.map(row => ({ feature: row.feature_key, permissions: 255 }))
                        : [{ feature: '*', permissions: 255 }];
                } else {
                    const permissionRows = await db.query(`
                        SELECT f.feature_key, rfp.permissions 
                        FROM role_feature_permissions rfp 
                        INNER JOIN features f ON rfp.feature_id = f.id 
                        WHERE rfp.role_id = ?
                    `, [user.role_id]);

                    permissions = permissionRows.map(row => ({
                        feature: row.feature_key,
                        permissions: row.permissions
                    }));
                }
            } catch (permError) {
                logger.warn('Failed to fetch permissions', { error: permError.message, userId: user.id });
            }

            const tokenPair = await jwtUtils.generateTokenPair(user, {
                tenantId: user.client || DB_NAME, // Use admin's client schema if available, else default to auth_db
                roleName: user.roleCode,
                permissions: permissions
            });
            const xsrfToken = await xsrfUtils.generateXSRFToken({
                userId: user.id,
                organizationId: user.organization_id,
                sessionId: context.sessionId,
                ipAddress: context.ipAddress,
                userAgent: context.userAgent
            });

            await loginAttempt.recordSuccessfulLogin(userOrgKey, attemptKey);

            const deviceName = deviceUtils.parseUserAgent(context.userAgent);
            const systemName = context.systemName || null; // Optional system identifier from client
            db.query(
                'UPDATE users SET last_login_at = NOW(), last_login_ip = ?, last_login_device = ?, last_login_system = ? WHERE id = ?',
                [context.ipAddress, deviceName, systemName, user.id]
            ).catch(err => logger.error('Failed to update last login', { err }));

            await auditService.log({
                organizationId: user.organization_id,
                userId: user.id,
                action: 'LOGIN',
                resourceType: 'USER',
                resourceId: user.id,
                ipAddress: context.ipAddress,
                userAgent: context.userAgent,
                requestId: context.requestId,
                status: 'SUCCESS'
            });

            logger.info('User logged in successfully', { userId: user.id, email: user.email, organizationId: user.organization_id });

            return {
                accessToken: tokenPair.accessToken,
                refreshToken: tokenPair.refreshToken,
                xsrfToken: xsrfToken.token,
                tenantId: DB_NAME, // Return database name as tenantId
                permissions: permissions,
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    organizationId: user.organization_id,
                    roleId: user.role_id,
                    roleCode: user.roleCode,
                    isAdmin: user.roleCode === 'SUPERADMIN' ? true : user.is_admin,
                    isPlatformAdmin: user.roleCode === 'SUPERADMIN' ? true : user.is_platform_admin,
                    isActive: user.roleCode === 'SUPERADMIN' ? true : !!user.is_active,
                    isSubscribed: user.roleCode === 'SUPERADMIN' ? true : !!user.is_subscribed,
                    isHold: user.roleCode === 'SUPERADMIN' ? false : !!user.is_hold,
                    client: user.client
                }
            };
        } catch (error) {
            logger.error('Login failed', { error: error.message, email, organizationId });
            throw error;
        }
    }

    async register(userData, organizationId) {
        try {
            const { email, password, firstName, lastName, phoneNumber, roleId } = userData;
            const username = email?.split('@')[0];

            const existing = await db.query('SELECT id FROM users WHERE email = ? AND organization_id = ?', [email, organizationId]);
            if (existing.length > 0) throw new Error('User already exists with this email');

            const hashedPassword = await bcrypt.hash(password, config.security.bcryptRounds);
            const userId = uuidv4();
            const sql = `INSERT INTO users (id, organization_id, email, username, password_hash, first_name, last_name, phone_number, role_id, enabled, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, true, true, NOW(), NOW())`;

            await db.query(sql, [userId, organizationId, email, username, hashedPassword, firstName || null, lastName || null, phoneNumber || null, roleId]);

            const users = await db.query('SELECT id, email, username, organization_id, role_id FROM users WHERE id = ?', [userId]);
            logger.info('User registered successfully', { userId, email, organizationId });
            return users[0];
        } catch (error) {
            logger.error('Registration failed', { error: error.message });
            throw error;
        }
    }

    async logout(accessToken, refreshToken) {
        try {
            if (accessToken) {
                const decoded = await jwtUtils.verifyAccessToken(accessToken);
                await jwtUtils.blacklistToken(decoded.jti, decoded.exp);
            }
            if (refreshToken) await jwtUtils.revokeRefreshToken(refreshToken);
            logger.info('User logged out', { accessToken: Boolean(accessToken), refreshToken: Boolean(refreshToken) });
            return true;
        } catch (error) {
            logger.error('Logout failed', { error: error.message });
            throw error;
        }
    }

    async refreshAccessToken(refreshToken) {
        try {
            const decoded = await jwtUtils.verifyRefreshToken(refreshToken);

            if (decoded.subjectType === 'candidate') {
                const candidates = await db.query(
                    'SELECT * FROM candidate_login WHERE id = ? AND is_active = true',
                    [decoded.userId]
                );
                if (candidates.length === 0) throw new Error('Candidate not found or inactive');
                const candidate = candidates[0];
                const tokenPair = await jwtUtils.generateCandidateTokenPair(candidate, { tenantId: DB_NAME });
                logger.info('Candidate token refreshed', { candidateId: candidate.id });
                return {
                    accessToken: tokenPair.accessToken,
                    refreshToken: tokenPair.refreshToken,
                    isCandidate: true,
                    user: {
                        id: candidate.id,
                        email: candidate.email,
                        username: candidate.email || candidate.mobile_number,
                        organizationId: candidate.organization_id,
                        roleCode: 'CANDIDATE'
                    }
                };
            }

            const users = decoded.organizationId ? await db.query(
                `SELECT u.*, r.version as roleVersion FROM users u INNER JOIN roles r ON u.role_id = r.id WHERE u.id = ? AND u.organization_id = ? AND u.is_active = true`,
                [decoded.userId, decoded.organizationId]
            ) : await db.query(
                `SELECT u.*, r.version as roleVersion FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ? AND u.is_platform_admin = true AND u.is_active = true`,
                [decoded.userId]
            );

            if (users.length === 0) throw new Error('User not found or inactive');
            const user = users[0];
            const accessToken = jwtUtils.generateAccessToken(user);
            logger.info('Access token refreshed', { userId: user.id, organizationId: user.organization_id });
            return { accessToken };
        } catch (error) {
            logger.error('Token refresh failed', { error: error.message });
            throw error;
        }
    }

    async silentRefresh(xsrfToken, context = {}) {
        try {
            // 1. Verify XSRF Token
            const isValidXSRF = await xsrfUtils.verifyXSRFToken(xsrfToken, context);
            if (!isValidXSRF) {
                throw new Error('Invalid XSRF token for silent refresh');
            }

            // 2. Get token metadata from Redis
            const tokenHash = require('crypto').createHash('sha256').update(xsrfToken).digest('hex');
            const redis = require('../config/redis');
            const tokenDataString = await redis.get(`xsrf:${tokenHash}`);
            const tokenData = typeof tokenDataString === 'string' ? JSON.parse(tokenDataString) : tokenDataString;

            if (!tokenData || !tokenData.userId) {
                throw new Error('Session not found for silent refresh');
            }

            // 3a. Candidate silent refresh (candidate_login)
            if (tokenData.subjectType === 'candidate') {
                const candidates = await db.query(
                    'SELECT * FROM candidate_login WHERE id = ? AND is_active = true',
                    [tokenData.userId]
                );
                if (candidates.length === 0) throw new Error('Candidate not found or inactive');
                const candidate = candidates[0];
                const tokenPair = await jwtUtils.generateCandidateTokenPair(candidate, { tenantId: DB_NAME });
                const newXsrfToken = await xsrfUtils.generateXSRFToken({
                    userId: candidate.id,
                    organizationId: candidate.organization_id,
                    subjectType: 'candidate',
                    sessionId: context.sessionId,
                    ipAddress: context.ipAddress,
                    userAgent: context.userAgent
                });
                logger.info('Candidate silent refresh successful', { candidateId: candidate.id });
                return {
                    accessToken: tokenPair.accessToken,
                    refreshToken: tokenPair.refreshToken,
                    xsrfToken: newXsrfToken.token,
                    permissions: [],
                    user: {
                        id: candidate.id,
                        email: candidate.email,
                        username: candidate.email || candidate.mobile_number,
                        organizationId: candidate.organization_id,
                        roleCode: 'CANDIDATE',
                        isAdmin: false,
                        isPlatformAdmin: false,
                        isActive: true
                    }
                };
            }

            // 3b. User silent refresh (users table)
            const users = await db.query(
                `SELECT u.*, r.version as roleVersion, r.code as roleCode,
                        u.is_active, u.is_subscribed, u.is_hold
                 FROM users u 
                 LEFT JOIN roles r ON u.role_id = r.id 
                 WHERE u.id = ? AND u.is_active = true`,
                [tokenData.userId]
            );

            if (users.length === 0) throw new Error('User not found or inactive');
            const user = users[0];

            let permissions = [];
            if (user.roleCode === 'SUPERADMIN') {
                const featureRows = await db.query('SELECT feature_key FROM features');
                permissions = featureRows.length > 0
                    ? featureRows.map(row => ({ feature: row.feature_key, permissions: 255 }))
                    : [{ feature: '*', permissions: 255 }];
            } else {
                const permissionRows = await db.query(`
                    SELECT f.feature_key, rfp.permissions 
                    FROM role_feature_permissions rfp 
                    INNER JOIN features f ON rfp.feature_id = f.id 
                    WHERE rfp.role_id = ?
                `, [user.role_id]);
                permissions = permissionRows.map(row => ({
                    feature: row.feature_key,
                    permissions: row.permissions
                }));
            }

            const tokenPair = await jwtUtils.generateTokenPair(user, {
                tenantId: user.client || DB_NAME,
                roleName: user.roleCode,
                permissions: permissions
            });

            const newXsrfToken = await xsrfUtils.generateXSRFToken({
                userId: user.id,
                organizationId: user.organization_id,
                sessionId: context.sessionId,
                ipAddress: context.ipAddress,
                userAgent: context.userAgent
            });

            logger.info('Silent refresh successful', { userId: user.id });

            return {
                accessToken: tokenPair.accessToken,
                refreshToken: tokenPair.refreshToken,
                xsrfToken: newXsrfToken.token,
                permissions,
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    organizationId: user.organization_id,
                    roleId: user.role_id,
                    roleCode: user.roleCode,
                    isAdmin: user.is_admin,
                    isPlatformAdmin: user.is_platform_admin,
                    isActive: user.roleCode === 'SUPERADMIN' ? true : !!user.is_active,
                    isSubscribed: user.roleCode === 'SUPERADMIN' ? true : !!user.is_subscribed,
                    isHold: user.roleCode === 'SUPERADMIN' ? false : !!user.is_hold,
                    client: user.client
                }
            };
        } catch (error) {
            logger.error('Silent refresh failed', { error: error.message });
            throw error;
        }
    }

    async changePassword(userId, oldPassword, newPassword) {
        try {
            const users = await db.query('SELECT password FROM users WHERE id = ?', [userId]);
            if (users.length === 0) throw new Error('User not found');

            const passwordMatch = await bcrypt.compare(oldPassword, users[0].password);
            if (!passwordMatch) throw new Error('Current password is incorrect');

            const hashedPassword = await bcrypt.hash(newPassword, config.security.bcryptRounds);
            await db.query('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [hashedPassword, userId]);
            logger.info('Password changed successfully', { userId });
            return true;
        } catch (error) {
            logger.error('Password change failed', { error: error.message, userId });
            throw error;
        }
    }

    // --- Candidate portal: uses auth_db.candidate_login only (not users table) ---

    /**
     * Find candidate by email or mobile in candidate_login table.
     */
    async findCandidateByEmailOrPhone(emailOrPhone) {
        const key = (emailOrPhone || '').trim();
        if (!key) return null;
        if (isEmail(key)) {
            const rows = await db.query(
                'SELECT * FROM candidate_login WHERE is_active = true AND LOWER(TRIM(email)) = LOWER(?) LIMIT 1',
                [key]
            );
            return rows.length > 0 ? rows[0] : null;
        }
        const digits = normalizePhone(key);
        if (!digits) return null;
        const rows = await db.query(
            `SELECT * FROM candidate_login WHERE is_active = true
             AND REPLACE(REPLACE(REPLACE(COALESCE(mobile_number,''), '+', ''), ' ', ''), '-', '') = ?
             LIMIT 1`,
            [digits]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Check if identifier exists in candidate_login. If in users table as admin/ATS, return notCandidatePortal.
     */
    async candidateCheck(emailOrPhone) {
        const candidate = await this.findCandidateByEmailOrPhone(emailOrPhone);
        if (candidate) return { existsInAuth: true };
        const user = await this.findUserByEmailOrPhone(emailOrPhone);
        if (user && user.roleCode && user.roleCode !== 'CANDIDATE') {
            return { existsInAuth: false, notCandidatePortal: true };
        }
        return { existsInAuth: false };
    }

    /**
     * Login using candidate_login table; issues access, refresh, and XSRF tokens.
     */
    async candidateLogin(emailOrPhone, password, organizationId, context = {}) {
        const trimmed = (emailOrPhone || '').trim();
        if (!trimmed) throw new Error('Email or phone is required');
        if (!password) throw new Error('Password is required');

        const candidate = await this.findCandidateByEmailOrPhone(trimmed);
        if (!candidate) throw new Error('Invalid credentials');

        const passwordMatch = await bcrypt.compare(password, candidate.password_hash);
        if (!passwordMatch) throw new Error('Invalid credentials');

        const tokenPair = await jwtUtils.generateCandidateTokenPair(candidate, {
            tenantId: DB_NAME
        });
        const xsrfToken = await xsrfUtils.generateXSRFToken({
            userId: candidate.id,
            organizationId: candidate.organization_id,
            subjectType: 'candidate',
            sessionId: context.sessionId,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent
        });

        db.query(
            'UPDATE candidate_login SET last_login_at = NOW(), last_login_ip = ? WHERE id = ?',
            [context.ipAddress, candidate.id]
        ).catch(err => logger.error('Failed to update candidate last login', { err }));

        logger.info('Candidate logged in', { candidateId: candidate.id, email: candidate.email, mobile: candidate.mobile_number });

        return {
            accessToken: tokenPair.accessToken,
            refreshToken: tokenPair.refreshToken,
            xsrfToken: xsrfToken.token,
            tenantId: DB_NAME,
            permissions: [],
            user: {
                id: candidate.id,
                email: candidate.email,
                username: candidate.email || candidate.mobile_number,
                organizationId: candidate.organization_id,
                roleCode: 'CANDIDATE',
                isAdmin: false,
                isPlatformAdmin: false,
                isActive: true
            }
        };
    }

    /**
     * Send OTP for new candidate (not in candidate_login). Returns OTP in response for toast display.
     */
    async candidateSendOtp(emailOrPhone) {
        const key = (emailOrPhone || '').trim();
        if (!key) throw new Error('Email or phone is required');
        const existing = await this.findCandidateByEmailOrPhone(key);
        if (existing) {
            throw new Error('Already registered. Please log in with your password.');
        }
        const otp = otpStore.sendAndStore(key);
        if (isEmail(key)) {
            const subject = 'Your verification code – KareerGrowth';
            const htmlBody = `<p>Your verification code is: <strong>${otp}</strong></p><p>It is valid for a short time. If you did not request this, please ignore this email.</p>`;
            const emailResult = await emailService.sendEmail(key, subject, htmlBody);
            if (!emailResult.sent) {
                logger.warn({ key: key.replace(/(?<=.{2})./g, '*'), err: emailResult.error }, 'Candidate OTP email not sent');
            }
        }
        return { sent: true, hint: isEmail(key) ? 'email' : 'phone', otp };
    }

    async candidateVerifyOtp(emailOrPhone, otp) {
        const key = (emailOrPhone || '').trim();
        if (!key || !otp) throw new Error('Email/phone and OTP are required');
        const ok = otpStore.verify(key, String(otp).trim());
        if (!ok) throw new Error('Incorrect OTP');
        return { verified: true };
    }

    /**
     * Fetch candidate details from college_candidates (via AdminBackend) by email or phone.
     * Returns { candidate } if found, else { candidate: null }.
     */
    async candidateGetDetails(emailOrPhone, organizationId) {
        const key = (emailOrPhone || '').trim();
        if (!key) return { candidate: null };
        const adminBackendUrl = config.adminBackendUrl || process.env.ADMIN_BACKEND_URL;
        const internalToken = config.service.internalToken || process.env.INTERNAL_SERVICE_TOKEN;
        if (!adminBackendUrl || !internalToken) return { candidate: null };
        const orgId = organizationId || process.env.CANDIDATE_DEFAULT_ORGANIZATION_ID || null;
        try {
            const axios = require('axios');
            const isEmail = key.includes('@');
            const payload = { email: isEmail ? key : undefined, mobile: isEmail ? undefined : key };
            if (orgId) payload.organizationId = orgId;
            const r = await axios.post(
                `${adminBackendUrl.replace(/\/$/, '')}/internal/candidates/by-identifier`,
                payload,
                { headers: { 'Content-Type': 'application/json', 'X-Service-Token': internalToken }, timeout: 8000 }
            );
            const candidate = r.data && r.data.candidate ? r.data.candidate : null;
            return { candidate };
        } catch (err) {
            logger.warn('Fetch candidate details failed', { error: err.message });
            return { candidate: null };
        }
    }

    /**
     * Register new candidate in candidate_login only (not in users table). Issues access, refresh, XSRF.
     */
    async candidateRegister(payload, context = {}) {
        const {
            email,
            mobile_number,
            candidate_name,
            password,
            confirmPassword,
            organizationId
        } = payload;

        if (!password || !candidate_name) {
            throw new Error('Name and password are required');
        }
        if (password !== confirmPassword) {
            throw new Error('Password and confirm password do not match');
        }
        if (!email && !mobile_number) {
            throw new Error('Email or mobile number is required');
        }

        const orgId = organizationId || process.env.CANDIDATE_DEFAULT_ORGANIZATION_ID || null;

        const existingByEmail = email ? await this.findCandidateByEmailOrPhone(email) : null;
        if (existingByEmail) throw new Error('Already registered with this email. Please sign in with your password.');

        const existingByMobile = mobile_number ? await this.findCandidateByEmailOrPhone(mobile_number) : null;
        if (existingByMobile) throw new Error('Already registered with this mobile number. Please sign in with your password.');

        const hashedPassword = await bcrypt.hash(password, config.security.bcryptRounds || 10);
        const candidateId = uuidv4();
        const normMobile = mobile_number ? normalizePhone(String(mobile_number)) : null;
        const normEmail = email ? String(email).trim().toLowerCase() : null;

        await db.query(
            `INSERT INTO candidate_login (id, email, mobile_number, password_hash, name, organization_id, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, true, NOW(), NOW())`,
            [candidateId, normEmail, normMobile || mobile_number || null, hashedPassword, candidate_name, orgId]
        );

        // Internal Sync: Create profile in CandidateBackend (college_candidates table)
        const candidateServiceUrl = config.candidateServiceUrl || process.env.CANDIDATE_SERVICE_URL;
        const internalToken = config.service.internalToken || process.env.INTERNAL_SERVICE_TOKEN;
        if (candidateServiceUrl && internalToken) {
            try {
                const axios = require('axios');
                await axios.post(
                    `${candidateServiceUrl.replace(/\/$/, '')}/candidates/add`,
                    {
                        name: candidate_name,
                        email: normEmail || email,
                        mobileNumber: mobile_number,
                        organizationId: orgId,
                        createdBy: 'Self'
                    },
                    { headers: { 'Content-Type': 'application/json', 'X-Service-Token': internalToken }, timeout: 5000 }
                );
            } catch (err) {
                logger.warn('Failed to sync candidate to CandidateBackend during registration', { error: err.message, candidateId });
            }
        }

        const candidate = await this.findCandidateByEmailOrPhone(normEmail || normMobile || email || mobile_number);
        if (!candidate) throw new Error('Registration failed');

        const tokenPair = await jwtUtils.generateCandidateTokenPair(candidate, { tenantId: DB_NAME });
        const xsrfToken = await xsrfUtils.generateXSRFToken({
            userId: candidate.id,
            organizationId: candidate.organization_id,
            subjectType: 'candidate',
            sessionId: context.sessionId,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent
        });

        logger.info('Candidate registered', { candidateId: candidate.id, email: candidate.email, mobile: candidate.mobile_number });

        return {
            accessToken: tokenPair.accessToken,
            refreshToken: tokenPair.refreshToken,
            xsrfToken: xsrfToken.token,
            user: {
                id: candidate.id,
                email: candidate.email,
                username: candidate.email || candidate.mobile_number,
                organizationId: candidate.organization_id,
                roleCode: 'CANDIDATE'
            }
        };
    }

    /**
     * Forgot password for candidate: lookup by email/phone and send reset (stub: always return success for security).
     */
    async candidateForgotPassword(emailOrPhone) {
        const key = (emailOrPhone || '').trim();
        if (!key) throw new Error('Email or phone is required');
        const candidate = await this.findCandidateByEmailOrPhone(key);
        if (candidate && isEmail(key)) {
            // TODO: generate reset token, send email with link
            logger.info('Candidate forgot password requested', { candidateId: candidate.id, key: key.replace(/(?<=.{2})./g, '*') });
        }
        // Always return success to avoid leaking whether account exists
    }
}

module.exports = AuthService;
