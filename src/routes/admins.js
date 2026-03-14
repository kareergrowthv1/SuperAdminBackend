const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

router.post('/create', adminController.createAdmin);
router.get('/', adminController.getAdmins);
router.get('/:id/credits', adminController.getAdminCredits);
router.get('/:id/details', adminController.getAdminDetails);   // profile only now
router.get('/:id/stats', adminController.getAdminStats);
router.get('/:id/payments', adminController.getAdminPayments);
router.get('/:id/credit-history', adminController.getAdminCreditHistory);
router.get('/:id/subscription', adminController.getAdminSubscription);
router.put('/:id', adminController.updateAdmin);
router.patch('/:id/status', adminController.updateAdminStatus);
router.get('/roles', adminController.getRoles);
router.post('/credits', adminController.addCredits);

module.exports = router;
