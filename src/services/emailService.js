/**
 * Send email via Zepto Mail. Config is read from superadmin_db.settings (key: emailSettings).
 * No hardcoded API keys or fromName – all from DB (fromName e.g. KareerGrowth).
 * Used for: candidate OTP email (send-otp).
 */
const axios = require('axios');
const { query } = require('../config/db');

async function getEmailConfig() {
    try {
        const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', ['emailSettings']);
        if (rows.length > 0 && rows[0].value) {
            const data = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
            return {
                enabled: Boolean(data.enabled),
                apiUrl: String(data.apiUrl || 'https://api.zeptomail.in/v1.1/email').trim(),
                apiKey: String(data.apiKey || '').trim(),
                fromEmail: String(data.fromEmail || '').trim(),
                fromName: String(data.fromName || 'KareerGrowth').trim()
            };
        }
    } catch (err) {
        console.warn('[emailService] Failed to read email config:', err.message);
    }
    return { enabled: false, apiUrl: '', apiKey: '', fromEmail: '', fromName: 'KareerGrowth' };
}

/**
 * Send one email via Zepto Mail using config from DB. No hardcoding.
 * @param {string} to - Recipient email
 * @param {string} subject - Subject line
 * @param {string} htmlBody - HTML body
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
async function sendEmail(to, subject, htmlBody) {
    const emailConfig = await getEmailConfig();
    if (!emailConfig.enabled || !emailConfig.apiKey || !emailConfig.fromEmail || !to) {
        return { sent: false, error: 'Email not enabled or config incomplete' };
    }
    const apiUrl = emailConfig.apiUrl || 'https://api.zeptomail.in/v1.1/email';
    const fromName = emailConfig.fromName || 'KareerGrowth';
    try {
        await axios.post(
            apiUrl,
            {
                from: { address: emailConfig.fromEmail, name: fromName },
                to: [{ email_address: { address: to } }],
                subject,
                htmlbody: htmlBody || ''
            },
            {
                timeout: 15000,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Zoho-enczapikey ${emailConfig.apiKey}`
                }
            }
        );
        return { sent: true };
    } catch (err) {
        const msg = err.response?.data?.message || err.response?.data?.error || err.message;
        console.warn('[emailService] Zepto send failed:', msg);
        return { sent: false, error: msg };
    }
}

module.exports = { getEmailConfig, sendEmail };
