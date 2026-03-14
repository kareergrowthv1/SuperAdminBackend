const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');

// Create new subscription
router.post('/', subscriptionController.createSubscription);

// Purchase additional credits (addon)
router.post('/purchase-credits', subscriptionController.purchaseCredits);

// Get subscription by client
router.get('/client/:clientSchema', subscriptionController.getSubscriptionByClient);

// Confirm payment and activate credits
router.post('/confirm/:paymentId', subscriptionController.confirmPayment);

// Calculate pricing (utility endpoint)
router.get('/calculate-pricing', subscriptionController.calculatePricing);

// Update subscription
router.put('/:id', subscriptionController.updateSubscription);

module.exports = router;
