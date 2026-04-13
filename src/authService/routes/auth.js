const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const tenantValidationMiddleware = require('../middleware/tenantValidation.middleware');
const jwtAuthMiddleware = require('../middleware/jwtAuth.middleware');
const xsrfValidationMiddleware = require('../middleware/xsrfValidation.middleware');
const validateMiddleware = require('../middleware/validate.middleware');
const rateLimitMiddleware = require('../middleware/rateLimit.middleware');

router.post(
    '/login',
    tenantValidationMiddleware,
    rateLimitMiddleware.auth,
    [
        body('email').optional().normalizeEmail(),
        body('emailOrPhone').optional().trim().notEmpty().withMessage('Email or phone is required when email not provided'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    validateMiddleware,
    (req, res, next) => {
        const email = req.body?.email;
        const emailOrPhone = req.body?.emailOrPhone?.trim();
        if (!email && !emailOrPhone) {
            return res.status(400).json({ success: false, message: 'Email or phone is required' });
        }
        if (email) req.body.emailOrPhone = email;
        else req.body.emailOrPhone = emailOrPhone;
        next();
    },
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

// Candidate portal: login (CANDIDATE role only), check, OTP, register
router.post(
    '/candidate/login',
    rateLimitMiddleware.auth,
    [
        body('emailOrPhone').trim().notEmpty().withMessage('Email or phone is required'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    validateMiddleware,
    authController.candidateLogin
);
router.post(
    '/candidate/check',
    rateLimitMiddleware.auth,
    [body('emailOrPhone').trim().notEmpty().withMessage('Email or phone is required')],
    validateMiddleware,
    authController.candidateCheck
);
router.post(
    '/candidate/send-otp',
    rateLimitMiddleware.auth,
    [body('emailOrPhone').trim().notEmpty().withMessage('Email or phone is required')],
    validateMiddleware,
    authController.candidateSendOtp
);
router.post(
    '/candidate/verify-otp',
    rateLimitMiddleware.auth,
    [
        body('emailOrPhone').trim().notEmpty().withMessage('Email or phone is required'),
        body('otp').notEmpty().withMessage('OTP is required')
    ],
    validateMiddleware,
    authController.candidateVerifyOtp
);
router.post(
    '/candidate/details',
    rateLimitMiddleware.auth,
    [body('emailOrPhone').trim().notEmpty().withMessage('Email or phone is required')],
    validateMiddleware,
    authController.candidateGetDetails
);
router.post(
    '/candidate/register',
    rateLimitMiddleware.auth,
    [
        body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail().withMessage('Valid email when provided'),
        body('mobile_number').optional().trim().custom((val, { req }) => {
            const hasEmail = req.body?.email && String(req.body.email).trim();
            const hasMobile = val != null && String(val).trim() !== '';
            if (hasEmail || hasMobile) return true;
            throw new Error('Email or mobile number is required');
        }),
        body('candidate_name').trim().notEmpty().withMessage('Name is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
        body('confirmPassword').custom((val, { req }) => val === req.body?.password).withMessage('Passwords do not match'),
        body('organizationId').optional().trim()
    ],
    validateMiddleware,
    authController.candidateRegister
);
router.post(
    '/candidate/forgot-password',
    rateLimitMiddleware.auth,
    [body('emailOrPhone').trim().notEmpty().withMessage('Email or phone is required')],
    validateMiddleware,
    authController.candidateForgotPassword
);
router.post(
    '/candidate/reset-password',
    rateLimitMiddleware.auth,
    [
        body('emailOrPhone').trim().notEmpty().withMessage('Email or phone is required'),
        body('otp').notEmpty().withMessage('OTP is required'),
        body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
    ],
    validateMiddleware,
    authController.candidateResetPassword
);

module.exports = router;
