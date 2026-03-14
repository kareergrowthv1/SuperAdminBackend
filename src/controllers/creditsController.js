const db = require('../config/db');
const syncService = require('../services/syncService');

/**
 * Get credits by client schema
 */
exports.getCreditsByClient = async (req, res, next) => {
    try {
        const { clientSchema } = req.params;

        const [adminRow] = await db.authQuery(
            'SELECT u.id, u.email, r.code as role_code FROM auth_db.users u LEFT JOIN auth_db.roles r ON u.role_id = r.id WHERE u.client = ? AND u.is_admin = 1 LIMIT 1',
            [clientSchema]
        );

        if (!adminRow) {
            const error = new Error('Admin not found for this client schema');
            error.status = 404;
            throw error;
        }

        const roleCode = adminRow.role_code || 'ADMIN';
        const creditsTable = 'credits'; // Both ATS and College use 'credits' table
        const isAtsRole = roleCode === 'ATS';

        const credits = await db.clientQuery(
            clientSchema,
            `SELECT 
                total_interview_credits,
                utilized_interview_credits,
                total_position_credits,
                utilized_position_credits,
                ${isAtsRole ? 'total_screening_credits,' : '0 as total_screening_credits,'}
                ${isAtsRole ? 'utilized_screening_credits,' : '0 as utilized_screening_credits,'}
                valid_till,
                is_active,
                created_at,
                updated_at
            FROM ${creditsTable}
            WHERE is_active = 1
            ORDER BY created_at DESC
            LIMIT 1`,
            []
        );

        if (credits.length === 0) {
            const error = new Error('Credits not found for this client');
            error.status = 404;
            throw error;
        }

        return res.status(200).json({
            success: true,
            message: 'Credits retrieved successfully',
            data: {
                client_schema: clientSchema,
                admin_user_id: adminRow?.id || null,
                admin_email: adminRow?.email || null,
                ...credits[0]
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get credits by admin user ID
 */
exports.getCreditsByAdmin = async (req, res, next) => {
    try {
        const { adminUserId } = req.params;

        const [adminRow] = await db.authQuery(
            'SELECT u.client, u.email, r.code as role_code FROM auth_db.users u LEFT JOIN auth_db.roles r ON u.role_id = r.id WHERE u.id = ? AND u.is_admin = 1 LIMIT 1',
            [adminUserId]
        );

        if (!adminRow || !adminRow.client) {
            const error = new Error('Admin client schema not found');
            error.status = 404;
            throw error;
        }

        const roleCode = adminRow.role_code || 'ADMIN';
        const creditsTable = 'credits'; // Both ATS and College use 'credits' table
        const isAtsRole = roleCode === 'ATS';

        const credits = await db.clientQuery(
            adminRow.client,
            `SELECT 
                total_interview_credits,
                utilized_interview_credits,
                total_position_credits,
                utilized_position_credits,
                ${isAtsRole ? 'total_screening_credits,' : '0 as total_screening_credits,'}
                ${isAtsRole ? 'utilized_screening_credits,' : '0 as utilized_screening_credits,'}
                valid_till,
                is_active,
                created_at,
                updated_at
            FROM ${creditsTable}
            WHERE is_active = 1
            ORDER BY created_at DESC
            LIMIT 1`,
            []
        );

        if (credits.length === 0) {
            const error = new Error('Credits not found for this admin');
            error.status = 404;
            throw error;
        }

        return res.status(200).json({
            success: true,
            message: 'Credits retrieved successfully',
            data: {
                client_schema: adminRow.client,
                admin_user_id: adminUserId,
                admin_email: adminRow.email || null,
                ...credits[0]
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all credits with filters
 */
exports.getAllCredits = async (req, res, next) => {
    try {
        const { isActive, nearExpiry } = req.query;

        const conditions = [];
        const params = [];

        if (isActive !== undefined) {
            conditions.push('is_active = ?');
            params.push(isActive === 'true' ? 1 : 0);
        }

        if (nearExpiry === 'true') {
            conditions.push('valid_till BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)');
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const admins = await db.authQuery(
            `SELECT u.id, u.email, u.client, r.code as role_code
             FROM auth_db.users u
             LEFT JOIN auth_db.roles r ON u.role_id = r.id
             WHERE u.is_admin = 1 AND u.client IS NOT NULL AND u.client <> ''`,
            []
        );

        const creditsRows = await Promise.all(
            admins.map(async (admin) => {
                try {
                    const roleCode = admin.role_code || 'ADMIN';
                    const creditsTable = 'credits'; // Both ATS and College use 'credits' table
                    const isAtsRole = roleCode === 'ATS';
                    
                    const rows = await db.clientQuery(
                        admin.client,
                        `SELECT 
                            total_interview_credits,
                            utilized_interview_credits,
                            total_position_credits,
                            utilized_position_credits,
                            ${isAtsRole ? 'total_screening_credits,' : '0 as total_screening_credits,'}
                            ${isAtsRole ? 'utilized_screening_credits,' : '0 as utilized_screening_credits,'}
                            valid_till,
                            is_active,
                            created_at,
                            updated_at
                        FROM ${creditsTable}
                        WHERE is_active = 1
                        ORDER BY created_at DESC
                        LIMIT 1`,
                        []
                    );

                    if (!rows[0]) return null;

                    return {
                        client_schema: admin.client,
                        admin_user_id: admin.id,
                        admin_email: admin.email,
                        ...rows[0]
                    };
                } catch (error) {
                    console.warn(`[CreditsController] Failed to fetch credits for ${admin.client}:`, error.message);
                    return null;
                }
            })
        );

        let credits = creditsRows.filter(Boolean);

        if (isActive !== undefined) {
            const activeValue = isActive === 'true' ? 1 : 0;
            credits = credits.filter(row => (row.is_active ? 1 : 0) === activeValue);
        }

        if (nearExpiry === 'true') {
            const now = new Date();
            const cutoff = new Date();
            cutoff.setDate(now.getDate() + 30);
            credits = credits.filter(row => row.valid_till && new Date(row.valid_till) <= cutoff);
        }

        return res.status(200).json({
            success: true,
            message: 'Credits retrieved successfully',
            data: {
                credits,
                count: credits.length
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Sync credits from client databases
 */
exports.syncCredits = async (req, res, next) => {
    try {
        const { clientSchema } = req.body;

        let result;
        if (clientSchema) {
            // Sync specific client (would need to implement this in syncService)
            result = await syncService.syncAllCredits();
        } else {
            // Sync all clients
            result = await syncService.syncAllCredits();
        }

        return res.status(200).json({
            success: true,
            message: 'Credits synced successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get credit usage history
 */
exports.getCreditHistory = async (req, res, next) => {
    try {
        const { clientSchema } = req.params;
        const { limit = 50 } = req.query;

        const history = await db.query(
            `SELECT 
                HEX(id) as id,
                client_schema,
                admin_user_id,
                change_type,
                interview_credits_change,
                position_credits_change,
                interview_credits_before,
                interview_credits_after,
                position_credits_before,
                position_credits_after,
                reason,
                changed_by,
                created_at
            FROM credits_history
            WHERE client_schema = ?
            ORDER BY created_at DESC
            LIMIT ?`,
            [clientSchema, parseInt(limit)]
        );

        return res.status(200).json({
            success: true,
            message: 'Credit history retrieved successfully',
            data: {
                history: history.map(h => ({
                    ...h,
                    id: h.id.toLowerCase().replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
                })),
                count: history.length
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update credit validity
 * DEPRECATED: This endpoint used the sync table which no longer exists.
 * Use /admins/:id/credits endpoint instead.
 */
exports.updateCreditValidity = async (req, res, next) => {
    return res.status(410).json({
        success: false,
        message: 'This endpoint is deprecated. Use /admins/:id/credits to manage credits.'
    });
};

/**
 * Deactivate credits
 * DEPRECATED: This endpoint used the sync table which no longer exists.
 * Use /admins/:id/credits endpoint instead.
 */
exports.deactivateCredits = async (req, res, next) => {
    return res.status(410).json({
        success: false,
        message: 'This endpoint is deprecated. Use /admins/:id/credits to manage credits.'
    });
};

/**
 * Check if admin has available position credits
 * DEPRECATED: This endpoint used the sync table which no longer exists.
 * Use /admins/:id/credits endpoint to check available credits.
 */
exports.checkPositionCredits = async (req, res, next) => {
    return res.status(410).json({
        success: false,
        message: 'This endpoint is deprecated. Use GET /admins/:id/credits to check available credits.'
    });
};

/**
 * Check if admin has available interview credits
 * DEPRECATED: This endpoint used the sync table which no longer exists.
 * Use /admins/:id/credits endpoint to check available credits.
 */
exports.checkInterviewCredits = async (req, res, next) => {
    return res.status(410).json({
        success: false,
        message: 'This endpoint is deprecated. Use GET /admins/:id/credits to check available credits.'
    });
};

/**
 * Consume a position credit
 * DEPRECATED: This endpoint used the sync table which no longer exists.
 * Credits are managed directly in tenant databases.
 */
exports.consumePositionCredit = async (req, res, next) => {
    return res.status(410).json({
        success: false,
        message: 'This endpoint is deprecated. Credit consumption is handled automatically in tenant databases.'
    });
};

/**
 * Consume an interview credit
 * DEPRECATED: This endpoint used the sync table which no longer exists.
 * Credits are managed directly in tenant databases.
 */
exports.consumeInterviewCredit = async (req, res, next) => {
    return res.status(410).json({
        success: false,
        message: 'This endpoint is deprecated. Credit consumption is handled automatically in tenant databases.'
    });
};

/**
 * Add credits for COLLEGE admin (no screening credits)
 * POST /api/v1/credits/add-college
 * Request body: { adminId, interviewCredits, positionCredits, validTill, paymentDetails }
 */
exports.addCollegeCredits = async (req, res, next) => {
    try {
        const creditsService = require('../services/creditsService');
        const { adminId, interviewCredits, positionCredits, validTill, paymentDetails } = req.body;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                message: 'Admin ID is required'
            });
        }

        const result = await creditsService.addCollegeCredits(
            adminId,
            interviewCredits,
            positionCredits,
            validTill,
            paymentDetails
        );

        return res.status(200).json(result);
    } catch (error) {
        console.error('[CreditsController.addCollegeCredits] Error:', error.message);
        next(error);
    }
};

/**
 * Add credits for ATS admin (includes screening credits)
 * POST /api/v1/credits/add-ats
 * Request body: { adminId, interviewCredits, positionCredits, screeningCredits, screeningCreditsMin, screeningCreditsCost, validTill, paymentDetails }
 */
exports.addAtsCredits = async (req, res, next) => {
    try {
        const creditsService = require('../services/creditsService');
        const {
            adminId,
            interviewCredits,
            positionCredits,
            screeningCredits,
            screeningCreditsMin,
            screeningCreditsCost,
            validTill,
            paymentDetails
        } = req.body;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                message: 'Admin ID is required'
            });
        }

        const result = await creditsService.addAtsCredits(
            adminId,
            interviewCredits,
            positionCredits,
            screeningCredits,
            screeningCreditsMin,
            screeningCreditsCost,
            validTill,
            paymentDetails
        );

        return res.status(200).json(result);
    } catch (error) {
        console.error('[CreditsController.addAtsCredits] Error:', error.message);
        next(error);
    }
};

/**
 * Auto-detect admin role and add appropriate credits
 * POST /api/v1/credits/add
 * This endpoint intelligently handles both college and ATS admins
 * Request body: { adminId, interviewCredits, positionCredits, screeningCredits, screeningCreditsMin, screeningCreditsCost, validTill, paymentDetails }
 */
exports.addCreditsAuto = async (req, res, next) => {
    try {
        const creditsService = require('../services/creditsService');
        const { adminId, interviewCredits, positionCredits, screeningCredits, screeningCreditsMin, screeningCreditsCost, validTill, paymentDetails } = req.body;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                message: 'Admin ID is required'
            });
        }

        // Query to determine admin role
        const [adminRow] = await db.authQuery(
            `SELECT r.code as role_code FROM auth_db.users u
             LEFT JOIN auth_db.roles r ON u.role_id = r.id
             WHERE u.id = ? AND u.is_admin = 1`,
            [adminId]
        );

        if (!adminRow) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        const roleCode = adminRow.role_code;
        let result;

        if (roleCode === 'ADMIN') {
            // College admin - no screening
            result = await creditsService.addCollegeCredits(
                adminId,
                interviewCredits,
                positionCredits,
                validTill,
                paymentDetails
            );
        } else if (roleCode === 'ATS') {
            // ATS admin - with screening
            result = await creditsService.addAtsCredits(
                adminId,
                interviewCredits,
                positionCredits,
                screeningCredits,
                screeningCreditsMin,
                screeningCreditsCost,
                validTill,
                paymentDetails
            );
        } else {
            return res.status(400).json({
                success: false,
                message: `Unknown admin role: ${roleCode}`
            });
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('[CreditsController.addCreditsAuto] Error:', error.message);
        next(error);
    }
};
