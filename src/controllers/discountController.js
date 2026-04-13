const { query, authQuery } = require('../config/db');

async function _ensureSuperadmin(req, res) {
    let isSuperadmin = false;
    const fromToken = req.user && (req.user.role || req.user.roleName || req.user.roleCode);
    const rawRole = fromToken || req.headers['x-user-role'] || req.headers['x-user-roles'];
    if (rawRole) {
        const userRole = typeof rawRole === 'string' ? rawRole.trim().toUpperCase() : '';
        isSuperadmin = userRole === 'SUPERADMIN' || userRole.split(',').map(r => r.trim().toUpperCase()).includes('SUPERADMIN');
    }
    if (!isSuperadmin && req.headers['x-user-id']) {
        try {
            let rows = await authQuery(
                `SELECT r.code FROM auth_db.users u
                 INNER JOIN auth_db.roles r ON r.id = u.role_id
                 WHERE u.id = ? AND (u.is_admin = 1 OR u.is_platform_admin = 1) LIMIT 1`,
                [req.headers['x-user-id']]
            );
            let roleCode = rows[0]?.code ?? rows[0]?.CODE;
            if (!roleCode || String(roleCode).toUpperCase() !== 'SUPERADMIN') {
                rows = await authQuery(
                    `SELECT r.code FROM auth_db.users u
                     INNER JOIN auth_db.roles r ON r.id = u.role_id
                     WHERE u.id = ? LIMIT 1`,
                    [req.headers['x-user-id']]
                );
                roleCode = rows[0]?.code ?? rows[0]?.CODE;
            }
            isSuperadmin = (roleCode && String(roleCode).toUpperCase() === 'SUPERADMIN');
        } catch (err) {
            console.warn('[RBAC] Fallback role lookup failed:', err.message);
        }
    }
    if (!isSuperadmin) {
        res.status(403).json({ success: false, message: 'Forbidden: Only Superadmins can perform this action' });
        return false;
    }
    return true;
}

class DiscountController {
    async getAllGroups(req, res) {
        try {
            const groups = await query('SELECT * FROM discount_groups ORDER BY created_at DESC');
            for (let group of groups) {
                const coupons = await query('SELECT * FROM discount_coupons WHERE group_id = ?', [group.id]);
                group.coupons = coupons;
            }
            res.status(200).json({ success: true, data: groups });
        } catch (error) {
            console.error('Failed to fetch discount groups:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch discount groups' });
        }
    }

    async createGroup(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const { id, expiresAt, forCandidates, forAdmins, totalLimit } = req.body;
            const formattedExpiresAt = new Date(expiresAt).toISOString().slice(0, 19).replace('T', ' ');
            await query(
                `INSERT INTO discount_groups (id, expires_at, for_candidates, for_admins, total_limit) 
                VALUES (?, ?, ?, ?, ?)`,
                [id || `group_${Date.now()}`, formattedExpiresAt, forCandidates ?? true, forAdmins ?? false, totalLimit || null]
            );
            res.status(201).json({ success: true, message: 'Discount group created' });
        } catch (error) {
            console.error('Failed to create discount group:', error);
            res.status(500).json({ success: false, message: 'Failed to create discount group' });
        }
    }

    async addCoupon(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const { groupId } = req.params;
            const { code, percentage } = req.body;
            await query(
                `INSERT INTO discount_coupons (group_id, code, percentage) VALUES (?, ?, ?)`,
                [groupId, code, percentage]
            );
            res.status(201).json({ success: true, message: 'Coupon added to group' });
        } catch (error) {
            console.error('Failed to add coupon:', error);
            res.status(500).json({ success: false, message: 'Failed to add coupon' });
        }
    }

    async deleteGroup(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const { id } = req.params;
            await query('DELETE FROM discount_groups WHERE id = ?', [id]);
            res.status(200).json({ success: true, message: 'Discount group deleted' });
        } catch (error) {
            console.error('Failed to delete discount group:', error);
            res.status(500).json({ success: false, message: 'Failed to delete discount group' });
        }
    }
}

module.exports = new DiscountController();
