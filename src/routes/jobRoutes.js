const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');

router.get('/', jobController.getJobs);
router.get('/locations', jobController.getLocations);
router.patch('/:id/status', jobController.updateJobStatus);

module.exports = router;
