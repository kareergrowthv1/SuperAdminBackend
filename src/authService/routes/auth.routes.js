const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const tenantValidationMiddleware = require('../middlewares/tenantValidation.middleware');
const jwtAuthMiddleware = require('../middlewares/jwtAuth.middleware');
const xsrfValidationMiddleware = require('../middlewares/xsrfValidation.middleware');
const validateMiddleware = require('../middlewares/validate.middleware');
const rateLimitMiddleware = require('../middlewares/rateLimit.middleware');

router.post(
    '/login',
    tenantValidationMiddleware,
    rateLimitMiddleware.auth,
    [
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    validateMiddleware,
    authController.login
);

router.post(
    '/register',
    tenantValidationMiddleware,
    rateLimitMiddleware.auth,
    [
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password')
            .isLength({ min: 8 })
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
        body('firstName').notEmpty().trim().withMessage('First name is required'),
        body('lastName').notEmpty().trim().withMessage('Last name is required'),
        body('phoneNumber').optional().isMobilePhone().withMessage('Valid phone number required'),
        body('roleId').isUUID().withMessage('Valid role ID is required')
    ],
    validateMiddleware,
    authController.register
);

router.post(
    '/logout',
    jwtAuthMiddleware,
    authController.logout
);

router.post(
    '/refresh',
    rateLimitMiddleware.auth,
    authController.refreshToken
);

router.post(
    '/change-password',
    jwtAuthMiddleware,
    xsrfValidationMiddleware,
    [
        body('oldPassword').notEmpty().withMessage('Old password is required'),
        body('newPassword')
            .isLength({ min: 8 })
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('New password must be at least 8 characters with uppercase, lowercase, number, and special character')
    ],
    validateMiddleware,
    authController.changePassword
);

router.get(
    '/me',
    jwtAuthMiddleware,
    authController.getCurrentUser
);

module.exports = router;
