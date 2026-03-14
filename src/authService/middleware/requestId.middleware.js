// Request ID Middleware - Generates unique request ID for tracing
const { v4: uuidv4 } = require('uuid');

const requestIdMiddleware = (req, res, next) => {
    // Check if request ID already exists (from load balancer/gateway)
    const existingRequestId = req.get('X-Request-ID');
    
    // Use existing or generate new
    const requestId = existingRequestId || uuidv4();
    
    // Set on request object
    req.requestId = requestId;
    
    // Set response header
    res.setHeader('X-Request-ID', requestId);
    
    next();
};

module.exports = requestIdMiddleware;
