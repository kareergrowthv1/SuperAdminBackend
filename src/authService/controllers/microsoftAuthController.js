const axios = require('axios');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const logger = require('../utils/logger');
const { authService } = require('../services');

const microsoftAuthController = {
    /**
     * Step 1: Redirect user to Microsoft for authorization
     */
    authorize: (req, res) => {
        const tenantId = config.microsoft.tenantId || 'common';
        const rootUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
        
        const options = {
            client_id: config.microsoft.clientId,
            response_type: 'code',
            redirect_uri: config.microsoft.callbackUrl,
            response_mode: 'query',
            scope: 'openid profile email User.Read',
            prompt: 'select_account'
        };

        const qs = new URLSearchParams(options);
        return res.redirect(`${rootUrl}?${qs.toString()}`);
    },

    /**
     * Step 2: Handle Microsoft callback
     */
    callback: async (req, res) => {
        const code = req.query.code;
        const tenantId = config.microsoft.tenantId || 'common';

        if (!code) {
            const baseUrl = (process.env.CANDIDATE_FRONTEND_URL || 'http://localhost:4003').replace(/\/$/, '');
            return res.redirect(`${baseUrl}/login?status=error&message=No code provided`);
        }

        try {
            // 1. Exchange code for access token
            const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
            
            const params = new URLSearchParams();
            params.append('client_id', config.microsoft.clientId);
            params.append('client_secret', config.microsoft.clientSecret);
            params.append('code', code);
            params.append('redirect_uri', config.microsoft.callbackUrl);
            params.append('grant_type', 'authorization_code');

            const { data: tokenData } = await axios.post(tokenUrl, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const { access_token, id_token } = tokenData;

            // 2. Fetch user details from Microsoft Graph
            const { data: microsoftUser } = await axios.get('https://graph.microsoft.com/v1.0/me', {
                headers: { Authorization: `Bearer ${access_token}` }
            });

            logger.info('Microsoft Graph User Profile', { 
                id: microsoftUser.id, 
                upn: microsoftUser.userPrincipalName, 
                mail: microsoftUser.mail 
            });

            // Decode ID Token for fallback claims
            let idTokenClaims = {};
            if (id_token) {
                try {
                    idTokenClaims = jwt.decode(id_token) || {};
                    logger.info('Microsoft ID Token Claims', { 
                        email: idTokenClaims.email, 
                        preferred_username: idTokenClaims.preferred_username 
                    });
                } catch (e) {
                    logger.warn('Failed to decode Microsoft ID token', { error: e.message });
                }
            }

            // Prioritize: 1. ID Token email, 2. Graph mail, 3. ID Token preferred_username, 4. UPN
            let email = idTokenClaims.email || microsoftUser.mail || idTokenClaims.preferred_username || microsoftUser.userPrincipalName;

            // Cleanup guest UPNs
            if (email && email.includes('#ext#')) {
                const parts = email.split('#ext#')[0];
                const lastUnderscore = parts.lastIndexOf('_');
                if (lastUnderscore !== -1) {
                    email = parts.substring(0, lastUnderscore) + '@' + parts.substring(lastUnderscore + 1);
                }
            }

            logger.info('Resolved Microsoft Email', { finalEmail: email });

            if (!email) {
                throw new Error('Microsoft email not found. Please ensure you have an email associated with your account.');
            }

            // 3. Login or register candidate in our system
            const result = await authService.loginWithSso({
                email: email,
                name: microsoftUser.displayName || 'Microsoft User',
                ssoProvider: 'microsoft',
                ssoId: microsoftUser.id,
                profileUrl: null // Profile picture requires a separate Graph API call usually
            });

            // 4. Set secure cookies
            res.cookie('accessToken', result.accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 30 * 60 * 1000 // 30 minutes
            });

            res.cookie('refreshToken', result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            res.cookie('XSRF-TOKEN', result.xsrfToken, {
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 30 * 60 * 1000
            });

            // 5. Redirect back to frontend success landing with tokens in URL
            const baseUrl = (process.env.CANDIDATE_FRONTEND_URL || 'http://localhost:4003').replace(/\/$/, '');
            const redirectUrl = `${baseUrl}/auth/microsoft-callback?status=success&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}&xsrfToken=${result.xsrfToken}`;
            
            logger.info('Microsoft SSO login successful', { email });
            return res.redirect(redirectUrl);

        } catch (error) {
            logger.error('Microsoft authentication process failed', { 
                error: error.message,
                stack: error.stack 
            });
            const baseUrl = (process.env.CANDIDATE_FRONTEND_URL || 'http://localhost:4003').replace(/\/$/, '');
            const errorMessage = error.response?.data?.error_description || error.message || 'Authentication failed';
            return res.redirect(`${baseUrl}/login?status=error&message=${encodeURIComponent(errorMessage)}`);
        }
    }
};

module.exports = microsoftAuthController;
