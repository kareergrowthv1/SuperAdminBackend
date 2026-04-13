const axios = require('axios');
const { authService } = require('../services');
const logger = require('../utils/logger');
const config = require('../../config');

class GithubAuthController {
    /**
     * Redirects the user to GitHub's OAuth authorization page.
     */
    redirectToGithub(req, res) {
        const clientId = config.github.clientId;
        const redirectUri = config.github.callbackUrl;
        const scope = 'user:email';
        
        const githubUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
        res.redirect(githubUrl);
    }

    /**
     * Handles the callback from GitHub after authorization.
     */
    async handleGithubCallback(req, res, next) {
        const { code } = req.query;
        if (!code) {
            logger.warn('GitHub OAuth callback missing code query parameter');
            return res.redirect(`${process.env.CANDIDATE_FRONTEND_URL}/login?error=no_code`);
        }

        try {
            // 1. Exchange code for access token
            const tokenResponse = await axios.post(
                'https://github.com/login/oauth/access_token',
                {
                    client_id: config.github.clientId,
                    client_secret: config.github.clientSecret,
                    code
                },
                { headers: { Accept: 'application/json' } }
            );

            const githubToken = tokenResponse.data.access_token;
            if (!githubToken) {
                logger.error('Failed to obtain access token from GitHub', { data: tokenResponse.data });
                throw new Error('Failed to get GitHub access token');
            }

            // 2. Get user emails from GitHub to find the primary verified one
            const emailResponse = await axios.get('https://api.github.com/user/emails', {
                headers: { Authorization: `token ${githubToken}` }
            });

            const primaryEmail = emailResponse.data.find(e => e.primary && e.verified)?.email || 
                           emailResponse.data.find(e => e.verified)?.email;

            if (!primaryEmail) {
                logger.error('No verified primary email found for GitHub user');
                throw new Error('No verified email found in GitHub account');
            }

            // 3. Get user profile for name
            const userResponse = await axios.get('https://api.github.com/user', {
                headers: { Authorization: `token ${githubToken}` }
            });

            const githubName = userResponse.data.name || userResponse.data.login;

            // 4. Delegate to AuthService for account linking/creation and session generation
            const result = await authService.loginWithGithub(primaryEmail, githubName, {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.requestId
            });

            // 5. Set session cookies (consistent with standard login)
            res.cookie('refreshToken', result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            res.cookie('accessToken', result.accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 30 * 60 * 1000 // 30 mins
            });

            res.cookie('XSRF-TOKEN', result.xsrfToken, {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 30 * 60 * 1000
            });

            // 6. Redirect back to frontend success landing
            // Final redirect to frontend with tokens in query params (for cross-port compatibility on localhost)
            const baseUrl = (process.env.CANDIDATE_FRONTEND_URL || 'http://localhost:4003').replace(/\/$/, '');
            const redirectUrl = `${baseUrl}/auth/github-callback?status=success&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}&xsrfToken=${result.xsrfToken}`;
            
            logger.debug('Redirecting to frontend', { url: redirectUrl.substring(0, 50) + '...' });
            return res.redirect(redirectUrl);
        } catch (error) {
            logger.error('GitHub authentication process failed', { 
                error: error.message,
                stack: error.stack 
            });
            const errorMsg = encodeURIComponent(error.message || 'Authentication failed');
            res.redirect(`${process.env.CANDIDATE_FRONTEND_URL}/login?error=auth_failed&message=${errorMsg}`);
        }
    }
}

module.exports = new GithubAuthController();
