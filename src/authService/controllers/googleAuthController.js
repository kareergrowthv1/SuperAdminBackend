const axios = require('axios');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const logger = require('../utils/logger');
const { authService } = require('../services');

const googleAuthController = {
    /**
     * Step 1: Redirect user to Google for authorization
     */
    authorize: (req, res) => {
        const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
        const options = {
            redirect_uri: config.google.callbackUrl,
            client_id: config.google.clientId,
            access_type: 'offline',
            response_type: 'code',
            prompt: 'consent',
            scope: [
                'https://www.googleapis.com/auth/userinfo.profile',
                'https://www.googleapis.com/auth/userinfo.email',
            ].join(' '),
        };

        const qs = new URLSearchParams(options);
        return res.redirect(`${rootUrl}?${qs.toString()}`);
    },

    /**
     * Step 2: Handle Google callback
     */
    callback: async (req, res) => {
        const code = req.query.code;

        if (!code) {
            return res.redirect(`${process.env.CANDIDATE_FRONTEND_URL}/login?error=no_code`);
        }

        try {
            // 1. Exchange code for tokens
            const { data } = await axios.post('https://oauth2.googleapis.com/token', {
                code,
                client_id: config.google.clientId,
                client_secret: config.google.clientSecret,
                redirect_uri: config.google.callbackUrl,
                grant_type: 'authorization_code',
            });

            const { access_token, id_token } = data;

            // 2. Fetch user details from Google userinfo endpoint
            const { data: googleUser } = await axios.get(
                `https://www.googleapis.com/oauth2/v3/userinfo?alt=json&access_token=${access_token}`,
                {
                    headers: {
                        Authorization: `Bearer ${id_token}`,
                    },
                }
            );

            if (!googleUser.email) {
                throw new Error('Google email not found');
            }

            // 3. Login or register candidate in our system via centralized AuthService
            const result = await authService.loginWithSso({
                email: googleUser.email,
                name: googleUser.name || googleUser.given_name || 'Google User',
                ssoProvider: 'google',
                ssoId: googleUser.sub,
                profileUrl: googleUser.picture
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

            // 5. Redirect back to frontend success landing with tokens in URL (hybrid approach)
            const baseUrl = (process.env.CANDIDATE_FRONTEND_URL || 'http://localhost:4003').replace(/\/$/, '');
            const redirectUrl = `${baseUrl}/auth/google-callback?status=success&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}&xsrfToken=${result.xsrfToken}`;
            
            logger.info('Google SSO login successful', { email: googleUser.email });
            return res.redirect(redirectUrl);

        } catch (error) {
            logger.error('Google authentication process failed', { 
                error: error.message,
                stack: error.stack 
            });
            const baseUrl = (process.env.CANDIDATE_FRONTEND_URL || 'http://localhost:4003').replace(/\/$/, '');
            return res.redirect(`${baseUrl}/login?status=error&message=Authentication failed`);
        }
    }
};

module.exports = googleAuthController;
