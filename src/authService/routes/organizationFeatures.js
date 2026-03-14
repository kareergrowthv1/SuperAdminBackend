const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const organizationFeaturesController = require('../controllers/organizationFeaturesController');
const tenantValidationMiddleware = require('../middleware/tenantValidation.middleware');
const jwtAuthMiddleware = require('../middleware/jwtAuth.middleware');
const tenantMatchMiddleware = require('../middleware/tenantMatch.middleware');
const xsrfValidationMiddleware = require('../middleware/xsrfValidation.middleware');
const permissionMiddleware = require('../middleware/permission.middleware');
const validateMiddleware = require('../middleware/validate.middleware');
const rateLimitMiddleware = require('../middleware/rateLimit.middleware');

router.use(tenantValidationMiddleware);
router.use(jwtAuthMiddleware);
router.use(tenantMatchMiddleware);
router.use(rateLimitMiddleware.api);
router.get(
    '/',
    permissionMiddleware('ROLES', 'READ'),
    organizationFeaturesController.getOrganizationFeatures
);

router.put(
    '/:featureId/enabled',
    xsrfValidationMiddleware,
    [
        param('featureId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid feature ID is required'),
        body('isEnabled').isBoolean().withMessage('isEnabled must be boolean')
    ],
    validateMiddleware,
    permissionMiddleware('ROLES', 'UPDATE'),
    organizationFeaturesController.setFeatureEnabled
);

router.put(
    '/:featureId/config',
    xsrfValidationMiddleware,
    [
        param('featureId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid feature ID is required'),
        body('config').isObject().withMessage('Config must be an object')
    ],
    validateMiddleware,
    permissionMiddleware('ROLES', 'UPDATE'),
    organizationFeaturesController.updateFeatureConfig
);

module.exports = router;
