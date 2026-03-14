const { query, authQuery } = require('../config/db');

async function _ensureSuperadmin(req, res) {
    let isSuperadmin = false;
    const fromToken = req.user && (req.user.role || req.user.roleName || req.user.roleCode);
    const rawRole = fromToken || req.headers['x-user-role'] || req.headers['x-user-roles'];
    if (rawRole) {
        const userRole = typeof rawRole === 'string' ? rawRole.trim().toUpperCase() : '';
        isSuperadmin = userRole === 'SUPERADMIN' || userRole.split(',').map(r => r.trim().toUpperCase()).includes('SUPERADMIN');
    }
    if (!isSuperadmin && req.headers['x-user-id']) {
        try {
            let rows = await authQuery(
                `SELECT r.code FROM auth_db.users u
                 INNER JOIN auth_db.roles r ON r.id = u.role_id
                 WHERE u.id = ? AND (u.is_admin = 1 OR u.is_platform_admin = 1) LIMIT 1`,
                [req.headers['x-user-id']]
            );
            let roleCode = rows[0]?.code ?? rows[0]?.CODE;
            if (!roleCode || String(roleCode).toUpperCase() !== 'SUPERADMIN') {
                rows = await authQuery(
                    `SELECT r.code FROM auth_db.users u
                     INNER JOIN auth_db.roles r ON r.id = u.role_id
                     WHERE u.id = ? LIMIT 1`,
                    [req.headers['x-user-id']]
                );
                roleCode = rows[0]?.code ?? rows[0]?.CODE;
            }
            isSuperadmin = (roleCode && String(roleCode).toUpperCase() === 'SUPERADMIN');
        } catch (err) {
            console.warn('[RBAC] Fallback role lookup failed:', err.message);
        }
    }
    if (!isSuperadmin && req.headers['x-role-id']) {
        try {
            const rows = await authQuery(
                'SELECT code FROM auth_db.roles WHERE id = ? LIMIT 1',
                [req.headers['x-role-id']]
            );
            const roleCode = rows[0]?.code ?? rows[0]?.CODE;
            isSuperadmin = (roleCode && String(roleCode).toUpperCase() === 'SUPERADMIN');
        } catch (err) {
            console.warn('[RBAC] Role-by-id lookup failed:', err.message);
        }
    }
    if (!isSuperadmin) {
        res.status(403).json({ success: false, message: 'Forbidden: Only Superadmins can update settings' });
        return false;
    }
    return true;
}

function _parseJson(val, fallback) {
    if (val === undefined || val === null) return fallback;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch (e) { return fallback; }
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
