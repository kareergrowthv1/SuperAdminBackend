const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');

router.get('/', settingsController.getSettings);
router.get('/ai-config', settingsController.getAiConfig);
router.post('/ai-config', settingsController.saveAiConfig);

router.get('/email', settingsController.getEmailConfig);
router.put('/email', settingsController.saveEmailConfig);

router.get('/whatsapp', settingsController.getWhatsappConfig);
router.put('/whatsapp', settingsController.saveWhatsappConfig);

router.get('/judge0', settingsController.getJudge0Config);
router.put('/judge0', settingsController.saveJudge0Config);

router.get('/google-meet', settingsController.getGoogleMeetConfig);
router.put('/google-meet', settingsController.saveGoogleMeetConfig);
router.get('/google-meet/oauth-url', settingsController.getGoogleMeetOauthUrl);
router.post('/google-meet/oauth-exchange', settingsController.exchangeGoogleMeetOauthCode);

router.get('/notifications', settingsController.getNotifications);
router.post('/notifications', settingsController.saveNotifications);

router.get('/candidates', settingsController.getCandidates);
router.post('/candidates', settingsController.saveCandidates);

router.get('/discounts', settingsController.getDiscounts);
router.post('/discounts', settingsController.saveDiscounts);

router.get('/credits', settingsController.getCredits);
router.post('/credits', settingsController.saveCredits);

router.post('/', settingsController.saveSettings);

module.exports = router;
