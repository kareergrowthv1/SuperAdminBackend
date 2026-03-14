const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

router.get('/summary', dashboardController.getSummary);
router.get('/credits', dashboardController.getCredits);
router.get('/activity', dashboardController.getActivity);
router.get('/health', dashboardController.getHealth);
router.get('/trends', dashboardController.getTrends);
router.get('/admins', dashboardController.getAdmins);

module.exports = router;
