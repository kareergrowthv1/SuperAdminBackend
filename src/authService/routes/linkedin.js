const express = require('express');
const router = express.Router();
const linkedinAuthController = require('../controllers/linkedinAuthController');

// Redirect to LinkedIn for authorization
router.get('/authorize', linkedinAuthController.authorize);

// Handle LinkedIn callback
router.get('/callback', linkedinAuthController.callback);

module.exports = router;
