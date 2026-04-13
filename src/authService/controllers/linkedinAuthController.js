const axios = require('axios');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const logger = require('../utils/logger');
const { authService } = require('../services');

const linkedinAuthController = {
    /**
     * Step 1: Redirect user to LinkedIn for authorization
     */
    authorize: (req, res) => {
        const rootUrl = 'https://www.linkedin.com/oauth/v2/authorization';
        
        const options = {
            response_type: 'code',
            client_id: config.linkedin.clientId,
            redirect_uri: config.linkedin.callbackUrl,
            state: 'random_state_string', // Should be dynamic in production
            scope: 'openid profile email'
        };

        const qs = new URLSearchParams(options);
        return res.redirect(`${rootUrl}?${qs.toString()}`);
    },

    /**
     * Step 2: Handle LinkedIn callback
     */
    callback: async (req, res) => {
        const { code, error, error_description } = req.query;

        if (error) {
            logger.error('LinkedIn Auth Error', { error, error_description });
            const baseUrl = (process.env.CANDIDATE_FRONTEND_URL || 'http://localhost:4003').replace(/\/$/, '');
            return res.redirect(`${baseUrl}/login?status=error&message=${encodeURIComponent(error_description || error)}`);
        }

        if (!code) {
            const baseUrl = (process.env.CANDIDATE_FRONTEND_URL || 'http://localhost:4003').replace(/\/$/, '');
            return res.redirect(`${baseUrl}/login?status=error&message=No authorization code provided`);
        }

        try {
            // 1. Exchange code for access token
            const tokenUrl = 'https://www.linkedin.com/oauth/v2/accessToken';
            
            const params = new URLSearchParams();
            params.append('grant_type', 'authorization_code');
            params.append('code', code);
            params.append('client_id', config.linkedin.clientId);
            params.append('client_secret', config.linkedin.clientSecret);
            params.append('redirect_uri', config.linkedin.callbackUrl);

            const { data: tokenData } = await axios.post(tokenUrl, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const { access_token } = tokenData;

            // 2. Fetch user information (using OpenID Connect endpoint)
            const { data: linkedinUser } = await axios.get('https://api.linkedin.com/v2/userinfo', {
                headers: { Authorization: `Bearer ${access_token}` }
            });

            const email = linkedinUser.email;
            if (!email) {
                throw new Error('LinkedIn email not found. Please ensure you have a primary email on LinkedIn.');
            }

            // 3. Login or register candidate via centralized AuthService
            const result = await authService.loginWithSso({
                email: email,
                name: `${linkedinUser.given_name || ''} ${linkedinUser.family_name || ''}`.trim() || linkedinUser.name || 'LinkedIn User',
                ssoProvider: 'linkedin',
                ssoId: linkedinUser.sub,
                profileUrl: linkedinUser.picture
            });

            // 4. Set secure session cookies
            res.cookie('accessToken', result.accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 30 * 60 * 1000 // 30 mins
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

            // 5. Redirect back to frontend success landing
            const baseUrl = (process.env.CANDIDATE_FRONTEND_URL || 'http://localhost:4003').replace(/\/$/, '');
            const redirectUrl = `${baseUrl}/auth/linkedin-callback?status=success&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}&xsrfToken=${result.xsrfToken}`;
            
            logger.info('LinkedIn SSO login successful', { email });
            return res.redirect(redirectUrl);

        } catch (err) {
            logger.error('LinkedIn authentication failed', { 
                error: err.message,
                response: err.response?.data 
            });
            const baseUrl = (process.env.CANDIDATE_FRONTEND_URL || 'http://localhost:4003').replace(/\/$/, '');
            return res.redirect(`${baseUrl}/login?status=error&message=${encodeURIComponent(err.message)}`);
        }
    }
};

module.exports = linkedinAuthController;
