const axios = require('axios');
const config = require('../config');
const { query, authQuery } = require('../config/db');

async function _ensureSuperadmin(req, res) {
    const isSuperadminCode = (value) => {
        const normalized = String(value || '').trim().toUpperCase();
        if (!normalized) return false;
        const compact = normalized.replace(/[\s_-]+/g, '');
        const allowed = new Set(['SUPERADMIN', 'PLATFORMADMIN']);
        return allowed.has(compact);
    };

    const isTruthyAdminFlag = (value) => {
        if (value === true || value === 1) return true;
        const s = String(value || '').trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes';
    };

    let isSuperadmin = false;
    const userOrgId = req.user?.organizationId ?? req.user?.organization_id ?? null;
    if (req.user && (
        isTruthyAdminFlag(req.user.isPlatformAdmin)
        || isTruthyAdminFlag(req.user.is_platform_admin)
        || (isTruthyAdminFlag(req.user.isAdmin) || isTruthyAdminFlag(req.user.is_admin)) && !userOrgId
    )) {
        isSuperadmin = true;
    }
    const fromToken = req.user && (req.user.role || req.user.roleName || req.user.roleCode || req.user.role_code);
    const reqUserId = req.user?.id || req.user?.userId || req.headers['x-user-id'];
    const reqRoleId = req.user?.roleId || req.user?.role_id || req.headers['x-role-id'];
    const rawRole = fromToken || req.headers['x-user-role'] || req.headers['x-user-roles'];
    console.log('[DEBUG] _ensureSuperadmin: req.user:', req.user);
    console.log('[DEBUG] _ensureSuperadmin: headers:', {
        'x-user-role': req.headers['x-user-role'],
        'x-user-roles': req.headers['x-user-roles'],
        'x-user-id': req.headers['x-user-id'],
        'authorization': req.headers['authorization']
    });
    if (rawRole) {
        const userRole = typeof rawRole === 'string' ? rawRole.trim().toUpperCase() : '';
        console.log('[DEBUG] _ensureSuperadmin: userRole:', userRole);
        isSuperadmin = isSuperadminCode(userRole)
            || userRole.split(',').map(r => r.trim().toUpperCase()).some(isSuperadminCode);
    }
    if (!isSuperadmin && reqUserId) {
        console.log('[DEBUG] _ensureSuperadmin: trying fallback lookup for user id', reqUserId);
        try {
            let rows = await authQuery(
                `SELECT r.code, u.is_admin, u.is_platform_admin, u.organization_id FROM auth_db.users u
                 INNER JOIN auth_db.roles r ON r.id = u.role_id
                 WHERE u.id = ? AND (u.is_admin = 1 OR u.is_platform_admin = 1) LIMIT 1`,
                [reqUserId]
            );
            let roleCode = rows[0]?.code ?? rows[0]?.CODE;
            const isPlatformAdmin = isTruthyAdminFlag(rows[0]?.is_platform_admin);
            const isGlobalAdmin = isTruthyAdminFlag(rows[0]?.is_admin) && !rows[0]?.organization_id;
            if (isPlatformAdmin || isGlobalAdmin) {
                isSuperadmin = true;
            }
            if (!isSuperadmin && !isSuperadminCode(roleCode)) {
                rows = await authQuery(
                    `SELECT r.code, u.is_admin, u.is_platform_admin, u.organization_id FROM auth_db.users u
                     INNER JOIN auth_db.roles r ON r.id = u.role_id
                     WHERE u.id = ? LIMIT 1`,
                    [reqUserId]
                );
                roleCode = rows[0]?.code ?? rows[0]?.CODE;
                const fallbackPlatformAdmin = isTruthyAdminFlag(rows[0]?.is_platform_admin);
                const fallbackGlobalAdmin = isTruthyAdminFlag(rows[0]?.is_admin) && !rows[0]?.organization_id;
                if (fallbackPlatformAdmin || fallbackGlobalAdmin) {
                    isSuperadmin = true;
                }
            }
            isSuperadmin = isSuperadmin || isSuperadminCode(roleCode);
        } catch (err) {
            console.warn('[RBAC] Fallback role lookup failed:', err.message);
        }
    }
    if (!isSuperadmin && reqRoleId) {
        console.log('[DEBUG] _ensureSuperadmin: trying fallback lookup for role id', reqRoleId);
        try {
            const rows = await authQuery(
                'SELECT code FROM auth_db.roles WHERE id = ? LIMIT 1',
                [reqRoleId]
            );
            const roleCode = rows[0]?.code ?? rows[0]?.CODE;
            isSuperadmin = isSuperadminCode(roleCode);
        } catch (err) {
            console.warn('[RBAC] Role-by-id lookup failed:', err.message);
        }
    }
    if (!isSuperadmin) {
        console.warn('[DEBUG] _ensureSuperadmin: NOT SUPERADMIN, denying access');
        res.status(403).json({ success: false, message: 'Forbidden: Only Superadmins can update settings' });
        return false;
    }
    console.log('[DEBUG] _ensureSuperadmin: SUPERADMIN detected, access granted');
    return true;
}

function _parseJson(val, fallback) {
    if (val === undefined || val === null) return fallback;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch (e) { return fallback; }
}

function _resolveCanonicalGoogleMeetRedirectUri(proposedUri) {
    const envOverride = String(process.env.GOOGLE_MEET_REDIRECT_URI || '').trim();
    const fallback = 'http://localhost:4000/auth/google/callback';
    const canonical = envOverride || fallback;

    const proposed = String(proposedUri || '').trim();
    if (!proposed) return canonical;

    // Allow localhost callback only. If caller sends LAN/IP callback, force canonical localhost URI.
    const allowed = new Set([
        'http://localhost:4000/auth/google/callback',
        'https://localhost:4000/auth/google/callback',
    ]);
    return allowed.has(proposed) ? proposed : canonical;
}

class SettingsController {
    /**
     * Get AI config from ai_config table (OpenAI/api key, model, etc. – for Streaming/AI service)
     */
    async getAiConfig(req, res) {
        try {
            const rows = await query(
                'SELECT provider, api_key, base_url, model, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, stream, timeout, chunk_size, retry_on_timeout, max_retries FROM ai_config WHERE id = 1 LIMIT 1'
            );
            const defaults = {
                provider: 'OPENAI',
                apiKey: '',
                baseUrl: 'https://api.openai.com/v1',
                model: 'gpt-3.5-turbo',
                temperature: 0.7,
                maxTokens: 1024,
                topP: 1.0,
                frequencyPenalty: 0,
                presencePenalty: 0,
                stream: true,
                timeout: 300,
                chunkSize: 1024,
                retryOnTimeout: true,
                maxRetries: 3
            };
            if (rows.length > 0) {
                const r = rows[0];
                res.status(200).json({
                    success: true,
                    data: {
                        provider: r.provider || defaults.provider,
                        apiKey: r.api_key != null ? String(r.api_key) : defaults.apiKey,
                        baseUrl: r.base_url != null ? String(r.base_url) : defaults.baseUrl,
                        model: r.model || defaults.model,
                        temperature: Number(r.temperature) ?? defaults.temperature,
                        maxTokens: Number(r.max_tokens) ?? defaults.maxTokens,
                        topP: Number(r.top_p) ?? defaults.topP,
                        frequencyPenalty: Number(r.frequency_penalty) ?? defaults.frequencyPenalty,
                        presencePenalty: Number(r.presence_penalty) ?? defaults.presencePenalty,
                        stream: Boolean(r.stream),
                        timeout: Number(r.timeout) ?? defaults.timeout,
                        chunkSize: Number(r.chunk_size) ?? defaults.chunkSize,
                        retryOnTimeout: Boolean(r.retry_on_timeout),
                        maxRetries: Number(r.max_retries) ?? defaults.maxRetries
                    }
                });
            } else {
                res.status(200).json({ success: true, data: defaults });
            }
        } catch (error) {
            console.error('Failed to fetch AI config:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch AI config'
            });
        }
    }

    /**
     * Get all settings
     */
    async getSettings(req, res) {
        try {
            const rows = await query('SELECT \`key\`, \`value\` FROM settings');
            const settings = {};
            rows.forEach(row => {
                settings[row.key] = row.value;
            });

            res.status(200).json({
                success: true,
                data: settings
            });
        } catch (error) {
            console.error('Failed to fetch settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch settings'
            });
        }

    }

    /**
     * Save/Update settings (bulk – kept for backward compatibility)
     */
    async saveSettings(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const settings = req.body;
            const promises = Object.entries(settings).map(([key, value]) => {
                const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
                return query(
                    'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = CURRENT_TIMESTAMP',
                    [key, val, val]
                );
            });
            await Promise.all(promises);
            res.status(200).json({ success: true, message: 'Settings updated successfully' });
        } catch (error) {
            console.error('Failed to save settings:', error);
            res.status(500).json({ success: false, message: 'Failed to save settings' });
        }
    }

    async getNotifications(req, res) {
        try {
            const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', ['emailConfigs']);
            const data = rows.length > 0 ? _parseJson(rows[0].value, []) : [];
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Failed to fetch notifications settings:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch notifications settings' });
        }
    }

    async saveNotifications(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const val = JSON.stringify(req.body.emailConfigs || []);
            await query(
                'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = CURRENT_TIMESTAMP',
                ['emailConfigs', val, val]
            );
            res.status(200).json({ success: true, message: 'Notifications settings saved' });
        } catch (error) {
            console.error('Failed to save notifications settings:', error);
            res.status(500).json({ success: false, message: 'Failed to save notifications settings' });
        }
    }

    async getCandidates(req, res) {
        try {
            const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', ['candidatePlans']);
            const data = rows.length > 0 ? _parseJson(rows[0].value, []) : [];
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Failed to fetch candidate plans:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch candidate plans' });
        }
    }

    async saveCandidates(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const val = JSON.stringify(req.body.candidatePlans || []);
            await query(
                'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = CURRENT_TIMESTAMP',
                ['candidatePlans', val, val]
            );
            res.status(200).json({ success: true, message: 'Candidate plans saved' });
        } catch (error) {
            console.error('Failed to save candidate plans:', error);
            res.status(500).json({ success: false, message: 'Failed to save candidate plans' });
        }
    }

    async getDiscounts(req, res) {
        try {
            const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', ['discounts']);
            const data = rows.length > 0 ? _parseJson(rows[0].value, []) : [];
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Failed to fetch discounts:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch discounts' });
        }
    }

    async saveDiscounts(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const val = JSON.stringify(req.body.discounts || []);
            await query(
                'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = CURRENT_TIMESTAMP',
                ['discounts', val, val]
            );
            res.status(200).json({ success: true, message: 'Discounts saved' });
        } catch (error) {
            console.error('Failed to save discounts:', error);
            res.status(500).json({ success: false, message: 'Failed to save discounts' });
        }
    }

    async getCredits(req, res) {
        try {
            const rows = await query('SELECT `key`, `value` FROM settings WHERE `key` IN (?, ?, ?, ?, ?, ?)',
                ['minimumInterviewCredits', 'minimumPositionCredits', 'minimumScreeningCredits', 'pricePerCredit', 'pricePerPosition', 'screeningCreditsCostPerPrice']);
            const data = {
                minimumInterviewCredits: 0,
                minimumPositionCredits: 0,
                minimumScreeningCredits: 0,
                pricePerCredit: 0,
                pricePerPosition: 0,
                screeningCreditsCostPerPrice: 0
            };
            rows.forEach(r => {
                const key = r.key;
                if (key === 'pricePerCredit' || key === 'pricePerPosition' || key === 'screeningCreditsCostPerPrice') {
                    data[key] = parseFloat(r.value) || 0;
                } else {
                    data[key] = parseInt(r.value, 10) || 0;
                }
            });
            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Failed to fetch credits settings:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch credits settings' });
        }
    }

    async saveCredits(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const b = req.body;
            const keys = ['minimumInterviewCredits', 'minimumPositionCredits', 'minimumScreeningCredits', 'pricePerCredit', 'pricePerPosition', 'screeningCreditsCostPerPrice'];
            for (const key of keys) {
                const val = String(b[key] ?? 0);
                await query(
                    'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = CURRENT_TIMESTAMP',
                    [key, val, val]
                );
            }
            res.status(200).json({ success: true, message: 'Credit limits saved' });
        } catch (error) {
            console.error('Failed to save credits settings:', error);
            res.status(500).json({ success: false, message: 'Failed to save credits settings' });
        }
    }

    /**
     * Get Email (Zepto Mail) config from settings table – fetched dynamically by services that send email.
     */
    async getEmailConfig(req, res) {
        try {
            const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', ['emailSettings']);
            const defaults = {
                enabled: false,
                apiUrl: 'https://api.zeptomail.in/v1.1/email',
                apiKey: '',
                fromEmail: '',
                fromName: 'KareerGrowth'
            };
            if (rows.length > 0 && rows[0].value) {
                const data = _parseJson(rows[0].value, defaults);
                res.status(200).json({
                    success: true,
                    data: {
                        enabled: Boolean(data.enabled),
                        apiUrl: String(data.apiUrl || defaults.apiUrl).trim(),
                        apiKey: String(data.apiKey || '').trim(),
                        fromEmail: String(data.fromEmail || '').trim(),
                        fromName: String(data.fromName || '').trim()
                    }
                });
            } else {
                res.status(200).json({ success: true, data: defaults });
            }
        } catch (error) {
            console.error('Failed to fetch email config:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch email config' });
        }
    }

    /**
     * Save Email (Zepto Mail) config to settings table.
     * Returns the saved config in same shape as GET so the UI can update without refetch.
     */
    async saveEmailConfig(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const b = req.body || {};
            const payload = {
                enabled: Boolean(b.enabled),
                apiUrl: String(b.apiUrl || 'https://api.zeptomail.in/v1.1/email').trim(),
                apiKey: String(b.apiKey || '').trim(),
                fromEmail: String(b.fromEmail || '').trim(),
                fromName: String(b.fromName || 'KareerGrowth').trim()
            };
            const val = JSON.stringify(payload);
            await query(
                'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = CURRENT_TIMESTAMP',
                ['emailSettings', val, val]
            );
            res.status(200).json({
                success: true,
                message: 'Email config saved',
                data: {
                    enabled: payload.enabled,
                    apiUrl: payload.apiUrl,
                    apiKey: payload.apiKey,
                    fromEmail: payload.fromEmail,
                    fromName: payload.fromName
                }
            });
        } catch (error) {
            console.error('Failed to save email config:', error);
            res.status(500).json({ success: false, message: 'Failed to save email config' });
        }
    }
    
    /**
     * Get WhatsApp (Interakt/Generic) config from settings table.
     */
    async getWhatsappConfig(req, res) {
        try {
            const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', ['whatsappSettings']);
            const defaults = {
                enabled: false,
                apiUrl: '',
                apiKey: '',
                templateName: '',
                fromNumber: '',
                languageCode: 'en'
            };
            if (rows.length > 0 && rows[0].value) {
                const data = _parseJson(rows[0].value, defaults);
                res.status(200).json({
                    success: true,
                    data: {
                        enabled: Boolean(data.enabled),
                        apiUrl: String(data.apiUrl || '').trim(),
                        apiKey: String(data.apiKey || '').trim(),
                        templateName: String(data.templateName || '').trim(),
                        fromNumber: String(data.fromNumber || '').trim(),
                        languageCode: String(data.languageCode || 'en').trim()
                    }
                });
            } else {
                res.status(200).json({ success: true, data: defaults });
            }
        } catch (error) {
            console.error('Failed to fetch WhatsApp config:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch WhatsApp config' });
        }
    }

    /**
     * Save WhatsApp (Interakt/Generic) config to settings table.
     */
    async saveWhatsappConfig(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const b = req.body || {};
            const payload = {
                enabled: Boolean(b.enabled),
                apiUrl: String(b.apiUrl || '').trim(),
                apiKey: String(b.apiKey || '').trim(),
                templateName: String(b.templateName || '').trim(),
                fromNumber: String(b.fromNumber || '').trim(),
                languageCode: String(b.languageCode || 'en').trim()
            };
            const val = JSON.stringify(payload);
            await query(
                'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = CURRENT_TIMESTAMP',
                ['whatsappSettings', val, val]
            );
            res.status(200).json({
                success: true,
                message: 'WhatsApp config saved',
                data: payload
            });
        } catch (error) {
            console.error('Failed to save WhatsApp config:', error);
            res.status(500).json({ success: false, message: 'Failed to save WhatsApp config' });
        }
    }

    /**
     * Get Judge0 (RapidAPI) config from settings table.
     */
    async getJudge0Config(req, res) {
        try {
            const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', ['judge0Settings']);
            const defaults = {
                enabled: false,
                baseUrl: '',
                apiKey: ''
            };
            if (rows.length > 0 && rows[0].value) {
                const data = _parseJson(rows[0].value, defaults);
                return res.status(200).json({
                    success: true,
                    data: {
                        enabled: Boolean(data.enabled),
                        baseUrl: String(data.baseUrl ?? '').trim(),
                        apiKey: String(data.apiKey ?? '').trim(),
                    }
                });
            }
            return res.status(200).json({ success: true, data: defaults });
        } catch (error) {
            console.error('Failed to fetch Judge0 config:', error);
            return res.status(500).json({ success: false, message: 'Failed to fetch Judge0 config' });
        }
    }

    /**
     * Save Judge0 (RapidAPI) config to settings table.
     */
    async saveJudge0Config(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const b = req.body ?? {};
            const payload = {
                enabled: Boolean(b.enabled),
                baseUrl: String(b.baseUrl ?? '').trim(),
                apiKey: String(b.apiKey ?? '').trim(),
            };
            const val = JSON.stringify(payload);
            await query(
                'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = CURRENT_TIMESTAMP',
                ['judge0Settings', val, val]
            );
            return res.status(200).json({ success: true, message: 'Judge0 config saved', data: payload });
        } catch (error) {
            console.error('Failed to save Judge0 config:', error);
            return res.status(500).json({ success: false, message: 'Failed to save Judge0 config' });
        }
    }

    /**
     * Get Google Meet integration config from settings table.
     */
    async getGoogleMeetConfig(req, res) {
        try {
            const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', ['googleMeetSettings']);
            const defaults = {
                enabled: false,
                clientId: '',
                clientSecret: '',
                refreshToken: '',
                calendarId: 'primary',
                panelMembers: [],
                includeLoggedInUser: true,
                notifyPanelSelection: true
            };
            if (rows.length > 0 && rows[0].value) {
                const data = _parseJson(rows[0].value, defaults);
                const panelMembers = Array.isArray(data.panelMembers)
                    ? data.panelMembers
                        .map((item) => ({
                            name: String(item?.name || '').trim(),
                            email: String(item?.email || '').trim().toLowerCase(),
                            role: String(item?.role || '').trim(),
                            skills: String(item?.skills || '').trim(),
                            experience: String(item?.experience || '').trim(),
                            isPrimary: item?.isPrimary === true
                        }))
                        .filter((item) => item.email)
                    : [];
                return res.status(200).json({
                    success: true,
                    data: {
                        enabled: Boolean(data.enabled),
                        clientId: String(data.clientId ?? '').trim(),
                        clientSecret: String(data.clientSecret ?? '').trim(),
                        refreshToken: String(data.refreshToken ?? '').trim(),
                        calendarId: String(data.calendarId ?? 'primary').trim() || 'primary',
                        panelMembers,
                        includeLoggedInUser: data.includeLoggedInUser !== false,
                        notifyPanelSelection: data.notifyPanelSelection !== false
                    }
                });
            }
            return res.status(200).json({ success: true, data: defaults });
        } catch (error) {
            console.error('Failed to fetch Google Meet config:', error);
            return res.status(500).json({ success: false, message: 'Failed to fetch Google Meet config' });
        }
    }

    /**
     * Save Google Meet integration config to settings table.
     */
    async saveGoogleMeetConfig(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const b = req.body ?? {};

            const normalizedMembers = Array.isArray(b.panelMembers)
                ? b.panelMembers
                    .map((item) => ({
                        name: String(item?.name || '').trim(),
                        email: String(item?.email || '').trim().toLowerCase(),
                        role: String(item?.role || '').trim(),
                        skills: String(item?.skills || '').trim(),
                        experience: String(item?.experience || '').trim(),
                        isPrimary: item?.isPrimary === true
                    }))
                    .filter((item) => item.email)
                : [];

            const payload = {
                enabled: Boolean(b.enabled),
                clientId: String(b.clientId ?? '').trim(),
                clientSecret: String(b.clientSecret ?? '').trim(),
                refreshToken: String(b.refreshToken ?? '').trim(),
                calendarId: String(b.calendarId ?? 'primary').trim() || 'primary',
                panelMembers: normalizedMembers,
                includeLoggedInUser: b.includeLoggedInUser !== false,
                notifyPanelSelection: b.notifyPanelSelection !== false
            };

            const val = JSON.stringify(payload);
            await query(
                'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = CURRENT_TIMESTAMP',
                ['googleMeetSettings', val, val]
            );

            return res.status(200).json({
                success: true,
                message: 'Google Meet config saved',
                data: payload
            });
        } catch (error) {
            console.error('Failed to save Google Meet config:', error);
            return res.status(500).json({ success: false, message: 'Failed to save Google Meet config' });
        }
    }

    /**
     * Build Google OAuth URL for Google Meet/Calendar integration.
     * Frontend redirect URI example: http://localhost:4001/auth/google/callback
     */
    async getGoogleMeetOauthUrl(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;

            const redirectUri = _resolveCanonicalGoogleMeetRedirectUri(req.query.redirectUri);
            if (!redirectUri) {
                return res.status(400).json({ success: false, message: 'redirectUri is required' });
            }

            const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', ['googleMeetSettings']);
            const current = rows.length > 0 ? _parseJson(rows[0].value, {}) : {};

            const clientId = String(current.clientId || config.google?.clientId || '').trim();
            if (!clientId) {
                return res.status(400).json({ success: false, message: 'Google Client ID is not configured' });
            }

            const statePayload = {
                source: 'google-meet-settings',
                redirectUri,
                t: Date.now()
            };
            const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

            const params = new URLSearchParams({
                client_id: clientId,
                redirect_uri: redirectUri,
                response_type: 'code',
                access_type: 'offline',
                prompt: 'consent',
                include_granted_scopes: 'true',
                scope: [
                    'https://www.googleapis.com/auth/calendar.events',
                    'https://www.googleapis.com/auth/calendar'
                ].join(' '),
                state
            });

            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
            return res.status(200).json({ success: true, data: { authUrl, redirectUri } });
        } catch (error) {
            console.error('Failed to generate Google Meet OAuth URL:', error);
            return res.status(500).json({ success: false, message: 'Failed to generate Google OAuth URL' });
        }
    }

    /**
     * Exchange Google OAuth code for refresh token and save to googleMeetSettings.
     */
    async exchangeGoogleMeetOauthCode(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;

            const code = String(req.body?.code || '').trim();
            const redirectUri = _resolveCanonicalGoogleMeetRedirectUri(req.body?.redirectUri);
            if (!code || !redirectUri) {
                return res.status(400).json({ success: false, message: 'code and redirectUri are required' });
            }

            const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', ['googleMeetSettings']);
            const defaults = {
                enabled: false,
                clientId: '',
                clientSecret: '',
                refreshToken: '',
                calendarId: 'primary',
                panelMembers: [],
                includeLoggedInUser: true,
                notifyPanelSelection: true
            };
            const current = rows.length > 0 ? _parseJson(rows[0].value, defaults) : defaults;

            const clientId = String(current.clientId || config.google?.clientId || '').trim();
            const clientSecret = String(current.clientSecret || config.google?.clientSecret || '').trim();

            if (!clientId || !clientSecret) {
                return res.status(400).json({ success: false, message: 'Google Client ID/Secret must be configured before OAuth connect' });
            }

            const tokenPayload = new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            });

            const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', tokenPayload.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 15000
            });

            const incomingRefreshToken = String(tokenResponse.data?.refresh_token || '').trim();
            const effectiveRefreshToken = incomingRefreshToken || String(current.refreshToken || '').trim();
            if (!effectiveRefreshToken) {
                return res.status(400).json({
                    success: false,
                    message: 'Google did not return refresh_token. Reconnect with consent prompt or remove app access and retry.'
                });
            }

            const payload = {
                enabled: current.enabled === true,
                clientId,
                clientSecret,
                refreshToken: effectiveRefreshToken,
                calendarId: String(current.calendarId || 'primary').trim() || 'primary',
                panelMembers: Array.isArray(current.panelMembers) ? current.panelMembers : [],
                includeLoggedInUser: current.includeLoggedInUser !== false,
                notifyPanelSelection: current.notifyPanelSelection !== false
            };

            const val = JSON.stringify(payload);
            await query(
                'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = CURRENT_TIMESTAMP',
                ['googleMeetSettings', val, val]
            );

            return res.status(200).json({
                success: true,
                message: 'Google OAuth connected successfully',
                data: {
                    connected: true,
                    hasRefreshToken: Boolean(effectiveRefreshToken),
                    calendarId: payload.calendarId
                }
            });
        } catch (error) {
            const message = error?.response?.data?.error_description || error?.response?.data?.error || error.message || 'OAuth exchange failed';
            console.error('Failed to exchange Google OAuth code:', message);
            return res.status(500).json({ success: false, message });
        }
    }

    async saveAiConfig(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const b = req.body || {};
            await query(
                `INSERT INTO ai_config (id, provider, api_key, base_url, model, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, stream, timeout, chunk_size, retry_on_timeout, max_retries)
                 VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 provider = VALUES(provider), api_key = VALUES(api_key), base_url = VALUES(base_url), model = VALUES(model),
                 temperature = VALUES(temperature), max_tokens = VALUES(max_tokens), top_p = VALUES(top_p),
                 frequency_penalty = VALUES(frequency_penalty), presence_penalty = VALUES(presence_penalty),
                 stream = VALUES(stream), timeout = VALUES(timeout), chunk_size = VALUES(chunk_size),
                 retry_on_timeout = VALUES(retry_on_timeout), max_retries = VALUES(max_retries),
                 updated_at = CURRENT_TIMESTAMP`,
                [
                    b.provider ?? 'OPENAI',
                    b.apiKey ?? '',
                    b.baseUrl ?? 'https://api.openai.com/v1',
                    b.model ?? 'gpt-3.5-turbo',
                    Number(b.temperature) ?? 0.7,
                    Number(b.maxTokens) ?? 1024,
                    Number(b.topP) ?? 1.0,
                    Number(b.frequencyPenalty) ?? 0,
                    Number(b.presencePenalty) ?? 0,
                    b.stream !== false ? 1 : 0,
                    Number(b.timeout) ?? 300,
                    Number(b.chunkSize) ?? 1024,
                    b.retryOnTimeout !== false ? 1 : 0,
                    Number(b.maxRetries) ?? 3
                ]
            );
            res.status(200).json({ success: true, message: 'AI config saved' });
        } catch (error) {
            console.error('Failed to save AI config:', error);
            res.status(500).json({ success: false, message: 'Failed to save AI config' });
        }
    }
}

module.exports = new SettingsController();
