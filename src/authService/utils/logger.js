// Logger Utility using Pino
const pino = require('pino');

const isDevelopment = process.env.NODE_ENV !== 'production';

// Configure Pino logger
const logger = pino({
    level: process.env.PINO_LOG_LEVEL || 'info',
    transport: isDevelopment
        ? {
              target: 'pino-pretty',
              options: {
                  colorize: true,
                  translateTime: 'SYS:standard',
                  ignore: 'pid,hostname',
                  singleLine: false
              }
          }
        : undefined,
    formatters: {
        level: (label) => {
            return { level: label };
        }
    },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    base: {
        service: 'auth-service',
        env: process.env.NODE_ENV || 'development'
    },
    serializers: {
        req: (req) => ({
            method: req.method,
            url: req.url,
            headers: {
                host: req.headers.host,
                'user-agent': req.headers['user-agent'],
                'x-request-id': req.headers['x-request-id'],
                'x-tenant-id': req.headers['x-tenant-id']
            },
            remoteAddress: req.remoteAddress,
            remotePort: req.remotePort
        }),
        res: (res) => ({
            statusCode: res.statusCode,
            headers: res.getHeaders ? res.getHeaders() : {}
        }),
        err: pino.stdSerializers.err
    }
});

/**
 * Log request/response in Express middleware
 */
const expressLogger = (req, res, next) => {
    const startTime = Date.now();

    // Log request
    logger.info({
        req,
        event: 'request-received'
    });

    // Intercept response
    const originalSend = res.send;
    res.send = function (data) {
        const duration = Date.now() - startTime;
        logger.info({
            res,
            duration,
            event: 'response-sent'
        });
        return originalSend.call(this, data);
    };

    next();
};

/**
 * Create child logger with additional context
 * @param {object} context - Additional context to add to all logs
 * @returns {object} Child logger instance
 */
const createChildLogger = (context) => {
    return logger.child(context);
};

/**
 * Log with context (for use in services/controllers)
 */
const logWithContext = (level, message, context = {}) => {
    logger[level]({
        ...context,
        message
    });
};

/**
 * Structured error logging
 * @param {Error} error - Error object
 * @param {object} context - Additional context
 */
const logError = (error, context = {}) => {
    logger.error({
        err: error,
        ...context,
        message: error.message,
        stack: error.stack
    });
};

/**
 * Audit log helper
 * @param {object} auditData - Audit information
 */
const logAudit = (auditData) => {
    logger.info({
        type: 'audit',
        ...auditData
    });
};

/**
 * Security event logging
 * @param {object} securityData - Security event information
 */
const logSecurity = (securityData) => {
    logger.warn({
        type: 'security',
        ...securityData
    });
};

/**
 * Performance logging
 * @param {string} operation - Operation name
 * @param {number} duration - Duration in milliseconds
 * @param {object} context - Additional context
 */
const logPerformance = (operation, duration, context = {}) => {
    logger.debug({
        type: 'performance',
        operation,
        duration,
        ...context
    });
};

module.exports = {
    logger,
    expressLogger,
    createChildLogger,
    logWithContext,
    logError,
    logAudit,
    logSecurity,
    logPerformance,
    // Expose log levels for direct use
    info: (msg, ctx) => logger.info(ctx || {}, msg),
    error: (msg, ctx) => logger.error(ctx || {}, msg),
    warn: (msg, ctx) => logger.warn(ctx || {}, msg),
    debug: (msg, ctx) => logger.debug(ctx || {}, msg),
    trace: (msg, ctx) => logger.trace(ctx || {}, msg)
};
