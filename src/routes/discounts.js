const express = require('express');
const router = express.Router();
const discountController = require('../controllers/discountController');

router.get('/groups', discountController.getAllGroups);
router.post('/groups', discountController.createGroup);
router.post('/groups/:groupId/coupons', discountController.addCoupon);
router.delete('/groups/:id', discountController.deleteGroup);

module.exports = router;
