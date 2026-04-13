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

class AdminPlanController {
    async getAllPlans(req, res) {
        try {
            const rows = await query('SELECT * FROM admin_subscription_plans ORDER BY created_at DESC');
            res.status(200).json({ success: true, data: rows });
        } catch (error) {
            console.error('Failed to fetch admin plans:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch admin plans' });
        }
    }

    async createPlan(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const { name, interviewCreditCost, positionCreditCost, minInterviewCredits, minPositionCredits } = req.body;
            const result = await query(
                `INSERT INTO admin_subscription_plans 
                (name, interview_credit_cost, position_credit_cost, min_interview_credits, min_position_credits) 
                VALUES (?, ?, ?, ?, ?)`,
                [name, interviewCreditCost || 0, positionCreditCost || 0, minInterviewCredits || 0, minPositionCredits || 0]
            );
            res.status(201).json({ success: true, data: { id: result.insertId, ...req.body } });
        } catch (error) {
            console.error('Failed to create admin plan:', error);
            res.status(500).json({ success: false, message: 'Failed to create admin plan' });
        }
    }

    async updatePlan(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const { id } = req.params;
            const { name, interviewCreditCost, positionCreditCost, minInterviewCredits, minPositionCredits } = req.body;
            await query(
                `UPDATE admin_subscription_plans 
                SET name = ?, interview_credit_cost = ?, position_credit_cost = ?, min_interview_credits = ?, min_position_credits = ?
                WHERE id = ?`,
                [name, interviewCreditCost, positionCreditCost, minInterviewCredits, minPositionCredits, id]
            );
            res.status(200).json({ success: true, message: 'Plan updated successfully' });
        } catch (error) {
            console.error('Failed to update admin plan:', error);
            res.status(500).json({ success: false, message: 'Failed to update admin plan' });
        }
    }

    async deletePlan(req, res) {
        try {
            if (!(await _ensureSuperadmin(req, res))) return;
            const { id } = req.params;
            await query('DELETE FROM admin_subscription_plans WHERE id = ?', [id]);
            res.status(200).json({ success: true, message: 'Plan deleted successfully' });
        } catch (error) {
            console.error('Failed to delete admin plan:', error);
            res.status(500).json({ success: false, message: 'Failed to delete admin plan' });
        }
    }
}

module.exports = new AdminPlanController();
