const express = require('express');
const router = express.Router();
const creditsController = require('../controllers/creditsController');
const adminController = require('../controllers/adminController');

// Get all credits
router.get('/', creditsController.getAllCredits);

// Get credits by client schema
router.get('/client/:clientSchema', creditsController.getCreditsByClient);

// Get credits by admin user ID
router.get('/admin/:adminUserId', creditsController.getCreditsByAdmin);

// Get credit history
router.get('/history/:clientSchema', creditsController.getCreditHistory);

// === Credit Availability Check (Java: GET /credits/organizations/:id/status) ===
// Check if admin has available position credits
router.get('/check/:adminId/position', creditsController.checkPositionCredits);
// Check if admin has available interview credits
router.get('/check/:adminId/interview', creditsController.checkInterviewCredits);

// === Credit Consumption (Java: POST /credits/organization/:id/add-position-credit) ===
// Consume a position credit (called after successful position creation)
router.post('/consume/:adminId/position', creditsController.consumePositionCredit);
// Consume an interview credit (called after interview is conducted)
router.post('/consume/:adminId/interview', creditsController.consumeInterviewCredit);

// Sync credits from client databases
router.post('/sync', creditsController.syncCredits);

// === Role-Specific Credit Addition Endpoints ===
// Add credits for COLLEGE admin (no screening)
router.post('/add-college', creditsController.addCollegeCredits);

// Add credits for ATS admin (with screening)
router.post('/add-ats', creditsController.addAtsCredits);

// Auto-detect admin role and add appropriate credits
router.post('/add', creditsController.addCreditsAuto);

// Legacy endpoint (for backward compatibility)
router.post('/add-legacy', adminController.addCredits);

// Update credit validity
router.patch('/:clientSchema/validity', creditsController.updateCreditValidity);

// Deactivate credits
router.patch('/:clientSchema/deactivate', creditsController.deactivateCredits);

module.exports = router;
