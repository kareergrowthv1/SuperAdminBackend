const express = require('express');
const router = express.Router();
const syncController = require('../controllers/syncController');

router.post('/credits', syncController.syncCredits);

module.exports = router;
