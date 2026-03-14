const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const roleController = require('../controllers/roleController');
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
    '/',
    permissionMiddleware('ROLES', 'READ'),
    roleController.getRoles
);

router.get(
    '/org/:orgId',
    [param('orgId').isUUID().withMessage('Valid organization ID is required')],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('ROLES', 'READ'),
    roleController.getRoles
);

router.get(
    '/:id',
    [param('id').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid role ID is required')],
    validateMiddleware,
    permissionMiddleware('ROLES', 'READ'),
    roleController.getRoleById
);

router.get(
    '/org/:orgId/:id',
    [
        param('orgId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid organization ID is required'),
        param('id').isUUID().withMessage('Valid role ID is required')
    ],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('ROLES', 'READ'),
    roleController.getRoleById
);

router.post(
    '/',
    xsrfValidationMiddleware,
    [
        body('code').optional().trim().notEmpty().withMessage('Role code is required'),
        body('name').notEmpty().trim().withMessage('Role name is required'),
        body('description').optional().trim()
    ],
    validateMiddleware,
    permissionMiddleware('ROLES', 'CREATE'),
    roleController.createRole
);

router.post(
    '/org/:orgId',
    xsrfValidationMiddleware,
    [
        param('orgId').isUUID().withMessage('Valid organization ID is required'),
        body('code').optional().trim().notEmpty().withMessage('Role code is required'),
        body('name').notEmpty().trim().withMessage('Role name is required'),
        body('description').optional().trim()
    ],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('ROLES', 'CREATE'),
    roleController.createRole
);

router.put(
    '/:id',
    xsrfValidationMiddleware,
    [
        param('id').isUUID().withMessage('Valid role ID is required'),
        body('code').optional().trim().notEmpty().withMessage('Role code cannot be empty'),
        body('name').optional().trim().notEmpty().withMessage('Role name cannot be empty'),
        body('description').optional().trim()
    ],
    validateMiddleware,
    permissionMiddleware('ROLES', 'UPDATE'),
    roleController.updateRole
);

router.put(
    '/org/:orgId/:id',
    xsrfValidationMiddleware,
    [
        param('orgId').isUUID().withMessage('Valid organization ID is required'),
        param('id').isUUID().withMessage('Valid role ID is required'),
        body('code').optional().trim().notEmpty().withMessage('Role code cannot be empty'),
        body('name').optional().trim().notEmpty().withMessage('Role name cannot be empty'),
        body('description').optional().trim()
    ],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('ROLES', 'UPDATE'),
    roleController.updateRole
);

router.delete(
    '/:id',
    xsrfValidationMiddleware,
    [param('id').isUUID().withMessage('Valid role ID is required')],
    validateMiddleware,
    permissionMiddleware('ROLES', 'DELETE'),
    roleController.deleteRole
);

router.delete(
    '/org/:orgId/:id',
    xsrfValidationMiddleware,
    [
        param('orgId').isUUID().withMessage('Valid organization ID is required'),
        param('id').isUUID().withMessage('Valid role ID is required')
    ],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('ROLES', 'DELETE'),
    roleController.deleteRole
);

module.exports = router;
