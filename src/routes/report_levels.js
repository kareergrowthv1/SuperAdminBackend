const express = require('express');
const router = express.Router();
const reportLevelController = require('../controllers/reportLevelController');

router.get('/', reportLevelController.getAll);
router.put('/:id', reportLevelController.update);

module.exports = router;
