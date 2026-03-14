/**
 * Auth Middleware for SuperadminBackend
 * Extracts user information from headers set by API Gateway after JWT verification
 */

const authMiddleware = (req, res, next) => {
  try {
    // API Gateway sets these headers after JWT verification
    const userId = req.headers['x-user-id'] || req.headers['X-User-Id'] || req.headers['X-User-ID'];
    const userRole = req.headers['x-user-role'] || req.headers['X-User-Role'];
    
    // For development/direct access, check authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Token exists but we rely on API Gateway for verification
      req.user = {
        id: userId,
        role: userRole
      };
      return next();
    }
    
    // Check if user info is present in headers
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required. No user information found.' 
      });
    }
    
    // Validate superadmin role
    if (userRole !== 'superadmin') {
      return res.status(403).json({ 
        success: false,
        message: 'Forbidden. Superadmin access required.' 
      });
    }
    
    // Attach user info to request object
    req.user = {
      id: userId,
      role: userRole
    };
    
    next();
  } catch (error) {
    console.error('[AuthMiddleware] Error:', error);
    return res.status(401).json({ 
      success: false,
      message: 'Authentication failed' 
    });
  }
};

module.exports = authMiddleware;
