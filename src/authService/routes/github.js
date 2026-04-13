const express = require('express');
const router = express.Router();
const githubAuthController = require('../controllers/githubAuthController');

/**
 * GET /api/auth-session/github/authorize
 * Initiates the GitHub OAuth flow.
 */
router.get('/authorize', githubAuthController.redirectToGithub);

/**
 * GET /api/auth-session/github/callback
 * Handles the redirect from GitHub.
 */
router.get('/callback', githubAuthController.handleGithubCallback);

module.exports = router;
