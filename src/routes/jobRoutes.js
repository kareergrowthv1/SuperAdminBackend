const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');

router.get('/', jobController.getJobs);
router.post('/', jobController.createJob);
router.get('/locations', jobController.getLocations);
router.get('/:id', jobController.getJobById);
router.put('/:id', jobController.updateJob);
router.patch('/:id/status', jobController.updateJobStatus);

module.exports = router;
