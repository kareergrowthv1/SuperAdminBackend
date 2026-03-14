const { authQuery } = require('../config/db');

/**
 * Ensures the request is from a Superadmin (by header or DB lookup).
 * Call in controllers for write operations. Returns false and sends 403 if not superadmin.
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @returns {Promise<boolean>} true if superadmin, false otherwise (response already sent)
 */
async function requireSuperadmin(req, res) {
  let rawRole = req.headers['x-user-role'] || req.headers['x-user-roles'];
  let isSuperadmin = false;
  if (rawRole) {
    const userRole = typeof rawRole === 'string' ? rawRole.trim().toUpperCase() : '';
    isSuperadmin = userRole === 'SUPERADMIN' || rawRole.split(',').map(r => String(r).trim().toUpperCase()).includes('SUPERADMIN');
  }
  if (!isSuperadmin && req.headers['x-user-id']) {
    try {
      const rows = await authQuery(
        `SELECT r.code FROM auth_db.users u
         INNER JOIN auth_db.roles r ON r.id = u.role_id
         WHERE u.id = ? AND u.is_admin = 1 LIMIT 1`,
        [req.headers['x-user-id']]
      );
      const roleCode = rows && rows[0] ? rows[0].code : null;
      isSuperadmin = roleCode && String(roleCode).toUpperCase() === 'SUPERADMIN';
    } catch (err) {
      // eslint-disable-next-line no-console
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
