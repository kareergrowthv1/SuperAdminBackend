const express = require('express');
const router = express.Router();
const adminPlanController = require('../controllers/adminPlanController');

router.get('/', adminPlanController.getAllPlans);
router.post('/', adminPlanController.createPlan);
router.put('/:id', adminPlanController.updatePlan);
router.delete('/:id', adminPlanController.deletePlan);

module.exports = router;
