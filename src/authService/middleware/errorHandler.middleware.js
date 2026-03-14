// Error Handler Middleware - Centralized error handling
const logger = require('../utils/logger');

const errorHandlerMiddleware = (err, req, res, next) => {
    // Log error
    logger.error('Application error', {
        error: err.message,
        stack: err.stack,
        requestId: req.requestId,
        userId: req.user?.userId,
        path: req.path,
        method: req.method
    });

    // Set audit context error
    if (req.auditContext) {
        req.auditContext.status = 'FAILURE';
        req.auditContext.errorMessage = err.message;
    }

    // Default error response
    let statusCode = err.statusCode || err.status || 500;
    let message = err.message || 'Internal server error';
    let code = err.code || 'INTERNAL_ERROR';

    // Handle specific error types
    if (err.name === 'ValidationError') {
        statusCode = 400;
        code = 'VALIDATION_ERROR';
        message = Object.values(err.errors || {}).map(e => e.message).join(', ') || message;
    } else if (err.name === 'UnauthorizedError') {
        statusCode = 401;
        code = 'UNAUTHORIZED';
        message = 'Authentication required';
    } else if (err.name === 'ForbiddenError') {
        statusCode = 403;
        code = 'FORBIDDEN';
    } else if (err.name === 'NotFoundError') {
        statusCode = 404;
        code = 'NOT_FOUND';
    } else if (err.name === 'ConflictError') {
        statusCode = 409;
        code = 'CONFLICT';
    } else if (err.code === 'ER_DUP_ENTRY') {
        statusCode = 409;
        code = 'DUPLICATE_ENTRY';
        message = 'Record already exists';
    } else if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        statusCode = 400;
        code = 'INVALID_REFERENCE';
        message = 'Referenced record does not exist';
    }

    // Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production' && statusCode === 500) {
        message = 'An unexpected error occurred';
    }

    // Send error response
    res.status(statusCode).json({
        success: false,
        message,
        code,
        requestId: req.requestId,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandlerMiddleware;
