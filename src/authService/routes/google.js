const express = require('express');
const router = express.Router();
const googleAuthController = require('../controllers/googleAuthController');

// GET /auth-session/google/authorize
router.get('/authorize', googleAuthController.authorize);

// GET /auth-session/google/callback
router.get('/callback', googleAuthController.callback);

module.exports = router;
