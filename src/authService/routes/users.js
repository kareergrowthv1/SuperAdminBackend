const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const userController = require('../controllers/userController');
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
    (req, res, next) => {
        if (req.query.id) {
            return userController.getUserById(req, res, next);
        }
        return next();
    },
    permissionMiddleware('USERS', 'READ'),
    userController.getUsers
);

router.get(
    '/org/:orgId',
    [param('orgId').isUUID().withMessage('Valid organization ID is required')],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('USERS', 'READ'),
    userController.getUsers
);

router.get(
    '/:id',
    [param('id').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid user ID is required')],
    validateMiddleware,
    permissionMiddleware('USERS', 'READ'),
    userController.getUserById
);

router.get(
    '/org/:orgId/:id',
    [
        param('orgId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid organization ID is required'),
        param('id').isUUID().withMessage('Valid user ID is required')
    ],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('USERS', 'READ'),
    userController.getUserById
);

router.post(
    '/',
    xsrfValidationMiddleware,
    [
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password')
            .isLength({ min: 8 })
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
        body('firstName').notEmpty().trim().withMessage('First name is required'),
        body('lastName').notEmpty().trim().withMessage('Last name is required'),
        body('phoneNumber').optional().isMobilePhone().withMessage('Valid phone number required'),
        body('roleId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid role ID is required')
    ],
    validateMiddleware,
    permissionMiddleware('USERS', 'CREATE'),
    userController.createUser
);

router.post(
    '/org/:orgId',
    xsrfValidationMiddleware,
    [
        param('orgId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid organization ID is required'),
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password')
            .isLength({ min: 8 })
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
        body('firstName').notEmpty().trim().withMessage('First name is required'),
        body('lastName').notEmpty().trim().withMessage('Last name is required'),
        body('phoneNumber').optional().isMobilePhone().withMessage('Valid phone number required'),
        body('roleId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid role ID is required')
    ],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('USERS', 'CREATE'),
    userController.createUser
);

router.put(
    '/:id',
    xsrfValidationMiddleware,
    [
        param('id').isUUID().withMessage('Valid user ID is required'),
        body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
        body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
        body('phoneNumber').optional().isMobilePhone().withMessage('Valid phone number required'),
        body('roleId').optional().isUUID().withMessage('Valid role ID is required'),
        body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
    ],
    validateMiddleware,
    permissionMiddleware('USERS', 'UPDATE'),
    userController.updateUser
);

router.put(
    '/org/:orgId/:id',
    xsrfValidationMiddleware,
    [
        param('orgId').matches(/^[0-9a-fA-F-]{36}$/).withMessage('Valid organization ID is required'),
        param('id').isUUID().withMessage('Valid user ID is required'),
        body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
        body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
        body('phoneNumber').optional().isMobilePhone().withMessage('Valid phone number required'),
        body('roleId').optional().isUUID().withMessage('Valid role ID is required'),
        body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
    ],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('USERS', 'UPDATE'),
    userController.updateUser
);

router.delete(
    '/:id',
    xsrfValidationMiddleware,
    [param('id').isUUID().withMessage('Valid user ID is required')],
    validateMiddleware,
    permissionMiddleware('USERS', 'DELETE'),
    userController.deleteUser
);

router.delete(
    '/org/:orgId/:id',
    xsrfValidationMiddleware,
    [
        param('orgId').isUUID().withMessage('Valid organization ID is required'),
        param('id').isUUID().withMessage('Valid user ID is required')
    ],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('USERS', 'DELETE'),
    userController.deleteUser
);

router.put(
    '/:id/unlock',
    xsrfValidationMiddleware,
    [param('id').isUUID().withMessage('Valid user ID is required')],
    validateMiddleware,
    permissionMiddleware('USERS', 'UPDATE'),
    userController.unlockUser
);

router.put(
    '/org/:orgId/:id/unlock',
    xsrfValidationMiddleware,
    [
        param('orgId').isUUID().withMessage('Valid organization ID is required'),
        param('id').isUUID().withMessage('Valid user ID is required')
    ],
    validateMiddleware,
    requireSameOrg,
    permissionMiddleware('USERS', 'UPDATE'),
    userController.unlockUser
);

module.exports = router;
