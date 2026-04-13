const { authQuery } = require('../config/db');

/**
 * Ensures the request is from a Superadmin (by header or DB lookup).
 * Call in controllers for write operations. Returns false and sends 403 if not superadmin.
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @returns {Promise<boolean>} true if superadmin, false otherwise (response already sent)
 */
async function requireSuperadmin(req, res) {
  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_INSECURE_TEST_AUTH === 'true') {
    const testBypass = req.headers['x-test-superadmin'] === 'true' || req.headers['x-user-role'] === 'SUPERADMIN';
    if (testBypass) {
      return true;
    }
  }

  let rawRole = req.headers['x-user-role'] || req.headers['x-user-roles'];
  let userId = req.headers['x-user-id'];
  
  let isSuperadmin = false;

  const checkRole = (role) => {
    if (!role) return false;
    const r = String(role).trim().toUpperCase();
    return r === 'SUPERADMIN' || r === 'PLATFORM_ADMIN' || r === 'ADMIN';
  };

  if (rawRole) {
    if (Array.isArray(rawRole)) {
      isSuperadmin = rawRole.some(checkRole);
    } else if (typeof rawRole === 'string') {
      isSuperadmin = rawRole.split(',').some(checkRole);
    }
  }

  if (!isSuperadmin && userId) {
    try {
      const rows = await authQuery(
        `SELECT r.code FROM auth_db.users u
         INNER JOIN auth_db.roles r ON r.id = u.role_id
         WHERE u.id = ? AND u.is_admin = 1 LIMIT 1`,
        [userId]
      );
      const roleCode = rows && rows[0] ? rows[0].code : null;
      isSuperadmin = checkRole(roleCode);
    } catch (err) {
      console.warn('[requireSuperadmin] Role lookup failed:', err.message);
    }
  }

  if (!isSuperadmin) {
    res.status(403).json({ success: false, message: 'Forbidden: Only Superadmins can perform this action' });
    return false;
  }
  return true;
}

module.exports = { requireSuperadmin };
