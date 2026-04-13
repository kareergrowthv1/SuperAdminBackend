const express = require('express');
const router = express.Router();
const microsoftAuthController = require('../controllers/microsoftAuthController');

// Redirect to Microsoft login
router.get('/authorize', microsoftAuthController.authorize);

// Handle Microsoft callback
router.get('/callback', microsoftAuthController.callback);

module.exports = router;
