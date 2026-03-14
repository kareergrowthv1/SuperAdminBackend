const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const permissionController = require('../controllers/permissionController');
const tenantValidationMiddleware = require('../middleware/tenantValidation.middleware');
const jwtAuthMiddleware = require('../middleware/jwtAuth.middleware');
const tenantMatchMiddleware = require('../middleware/tenantMatch.middleware');
const xsrfValidationMiddleware = require('../middleware/xsrfValidation.middleware');
const permissionMiddleware = require('../middleware/permission.middleware');
const validateMiddleware = require('../middleware/validate.middleware');
const rateLimitMiddleware = require('../middleware/rateLimit.middleware');

const requireSameOrg = (req, res, next) => {
    const { orgId } = req.params;

    if (orgId && req.user?.organizationId !== orgId) {
        return res.status(403).json({
            success: false,
            message: 'Tenant mismatch. Access denied.',
            code: 'TENANT_MISMATCH'
        });
    }

    return next();
};

router.use(tenantValidationMiddleware);
router.use(jwtAuthMiddleware);
router.use(tenantMatchMiddleware);
router.use(rateLimitMiddleware.api);
router.get(
    '/features',
    permissionMiddleware('ROLES', 'READ'),
    permissionController.getAllFeatures
);

router.get(
    '/org/:orgId/features',
    [param('orgId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid organization ID is required')],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('ROLES', 'READ'),
    permissionController.getAllFeatures
);

router.get(
    '/roles/:roleId',
    [param('roleId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid role ID is required')],
    validateMiddleware,
    permissionMiddleware('ROLES', 'READ'),
    permissionController.getRolePermissions
);

router.get(
    '/org/:orgId/roles/:roleId',
    [
        param('orgId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid organization ID is required'),
        param('roleId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid role ID is required')
    ],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('ROLES', 'READ'),
    permissionController.getRolePermissions
);

router.put(
    '/roles/:roleId/features/:featureId',
    xsrfValidationMiddleware,
    [
        param('roleId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid role ID is required'),
        param('featureId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid feature ID is required'),
        body('permissions').isInt({ min: 0, max: 255 }).withMessage('Permissions must be an integer between 0 and 255')
    ],
    validateMiddleware,
    permissionMiddleware('ROLES', 'UPDATE'),
    permissionController.updateRolePermission
);

router.put(
    '/org/:orgId/roles/:roleId/features/:featureId',
    xsrfValidationMiddleware,
    [
        param('orgId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid organization ID is required'),
        param('roleId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid role ID is required'),
        param('featureId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid feature ID is required'),
        body('permissions').isInt({ min: 0, max: 255 }).withMessage('Permissions must be between 0 and 255')
    ],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('ROLES', 'UPDATE'),
    permissionController.updateRolePermission
);

router.put(
    '/roles/:roleId/bulk',
    xsrfValidationMiddleware,
    [
        param('roleId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid role ID is required'),
        body('permissions').isArray().withMessage('Permissions must be an array'),
        body('permissions.*.featureId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid feature ID is required'),
        body('permissions.*.permissions').isInt({ min: 0, max: 255 }).withMessage('Permissions must be between 0 and 255')
    ],
    validateMiddleware,
    permissionMiddleware('ROLES', 'UPDATE'),
    permissionController.bulkUpdateRolePermissions
);

router.put(
    '/org/:orgId/roles/:roleId/bulk',
    xsrfValidationMiddleware,
    [
        param('orgId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid organization ID is required'),
        param('roleId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid role ID is required'),
        body('permissions').isArray().withMessage('Permissions must be an array'),
        body('permissions.*.featureId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid feature ID is required'),
        body('permissions.*.permissions').isInt({ min: 0, max: 255 }).withMessage('Permissions must be between 0 and 255')
    ],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('ROLES', 'UPDATE'),
    permissionController.bulkUpdateRolePermissions
);

router.delete(
    '/roles/:roleId/features/:featureId',
    xsrfValidationMiddleware,
    [
        param('roleId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid role ID is required'),
        param('featureId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid feature ID is required')
    ],
    validateMiddleware,
    permissionMiddleware('ROLES', 'DELETE'),
    permissionController.deleteRolePermission
);

router.delete(
    '/org/:orgId/roles/:roleId/features/:featureId',
    xsrfValidationMiddleware,
    [
        param('orgId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid organization ID is required'),
        param('roleId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid role ID is required'),
        param('featureId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid feature ID is required')
    ],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('ROLES', 'DELETE'),
    permissionController.deleteRolePermission
);

module.exports = router;
