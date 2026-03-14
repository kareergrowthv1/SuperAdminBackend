const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Create payment
router.post('/', paymentController.createPayment);

// Get all payments (with pagination and filters)
router.get('/', paymentController.getAllPayments);

// Get payment statistics
router.get('/stats', paymentController.getPaymentStats);

// Get payment by ID
router.get('/:paymentId', paymentController.getPaymentById);

// Get payments by admin user ID
router.get('/admin/:adminUserId', paymentController.getPaymentsByAdmin);

// Get payments by client schema
router.get('/client/:clientSchema', paymentController.getPaymentsByClient);

// Update payment status
router.patch('/:paymentId/status', paymentController.updatePaymentStatus);

module.exports = router;
