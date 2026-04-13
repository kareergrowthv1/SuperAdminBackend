const express = require('express');
const router = express.Router();
const controller = require('../controllers/resumeTemplateController');

router.get('/templates', controller.getTemplates);
router.get('/templates/:id', controller.getTemplateById);
router.post('/templates', controller.createTemplate);
router.put('/templates/:id', controller.updateTemplate);
router.delete('/templates/:id', controller.deleteTemplate);

router.get('/reports', controller.getResumeReports);

module.exports = router;
