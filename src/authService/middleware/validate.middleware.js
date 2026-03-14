// Validation Middleware - Request validation helper
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Validate request and return errors if any
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => ({
            field: err.param,
            message: err.msg,
            value: err.value
        }));

        logger.warn('Validation failed', {
            errors: errorMessages,
            path: req.path,
            requestId: req.requestId
        });

        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            errors: errorMessages
        });
    }

    next();
};

module.exports = validate;
