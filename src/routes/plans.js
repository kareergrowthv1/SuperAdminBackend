const express = require('express');
const router = express.Router();
const planController = require('../controllers/planController');

router.get('/', planController.getAll);
router.get('/:id', planController.getById);
router.post('/', planController.create);
router.put('/:id', planController.update);
router.delete('/:id', planController.remove);

module.exports = router;
