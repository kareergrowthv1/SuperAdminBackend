/**
 * Credits Service - Role-Specific Credit Management
 * Separates college admin credits (no screening) from ATS admin credits (with screening)
 */

const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Add credits for COLLEGE admin (campus recruitment only - no screening)
 * @param {string} adminId - Admin user ID
 * @param {number} interviewCredits - Interview credits to add
 * @param {number} positionCredits - Position credits to add
 * @param {string} validTill - Credit validity date (YYYY-MM-DD)
 * @param {object} paymentDetails - Optional payment tracking details
 */
const addCollegeCredits = async (
    adminId,
    interviewCredits,
    positionCredits,
    validTill,
    paymentDetails = {}
) => {
    if (!adminId) throw new Error('Admin ID is required');
    if (!interviewCredits && !positionCredits) throw new Error('At least interview or position credits required');

    console.log(`[CreditsService.addCollegeCredits] Attempting to add credits for college admin ${adminId}`);

    // Sanitize inputs
    const safeInterviewCredits = interviewCredits ?? 0;
    const safePositionCredits = positionCredits ?? 0;
    const safeValidTill = validTill ?? null;
    const { paymentMethod = null, paymentId = null, receivedBy = null, paymentDate = null } = paymentDetails;

    // 1. Verify admin exists and is ADMIN role (college) — from auth_db
    const adminRows = await db.authQuery(
        `SELECT u.id, u.client as client_schema, u.email, r.code as role_code
         FROM auth_db.users u
         LEFT JOIN auth_db.roles r ON u.role_id = r.id
         WHERE u.id = ? AND u.is_admin = 1`,
        [adminId]
    );

    if (adminRows.length === 0) {
        throw new Error('Admin not found');
    }

    const { client_schema, email, role_code } = adminRows[0];

    if (role_code !== 'ADMIN') {
        throw new Error(`This endpoint is for COLLEGE admins only. User has role: ${role_code}`);
    }

    if (!client_schema) {
        throw new Error('Client schema not found for this admin');
    }

    console.log(`[CreditsService] College admin: ${email}, Schema: ${client_schema}`);

    // 2. Get current credits before update
    let before = { total_interview_credits: 0, total_position_credits: 0 };
    try {
        const existing = await db.clientQuery(
            client_schema,
            `SELECT total_interview_credits, total_position_credits 
             FROM credits WHERE is_active = 1 LIMIT 1`,
            []
        );
        before = existing[0] || before;
    } catch (err) {
        console.warn(`[CreditsService] Could not fetch current credits for ${client_schema}, will create default`);
    }

    // 3. Update or insert credits (college schema - no screening)
    const updateSql = `UPDATE credits SET 
        total_interview_credits = total_interview_credits + ?,
        total_position_credits = total_position_credits + ?,
        valid_till = ?,
        updated_at = NOW()
        WHERE is_active = 1
        LIMIT 1`;

    try {
        await db.clientQuery(
            client_schema,
            updateSql,
            [safeInterviewCredits, safePositionCredits, safeValidTill]
        );
    } catch (err) {
        console.error(`[CreditsService] Update failed: ${err.message}, attempting insert`);
        // If update fails, insert new record
        const creditsId = uuidv4();
        const idBuffer = Buffer.from(creditsId.replace(/-/g, ''), 'hex');
        const orgIdBuffer = Buffer.from('00000000000000000000000000000000', 'hex');

        await db.clientQuery(
            client_schema,
            `INSERT INTO credits (
                id, organization_id, 
                total_interview_credits, utilized_interview_credits,
                total_position_credits, utilized_position_credits,
                valid_till, is_active,
                created_at, updated_at
            ) VALUES (?, ?, ?, 0, ?, 0, ?, 1, NOW(), NOW())`,
            [idBuffer, orgIdBuffer, safeInterviewCredits, safePositionCredits, safeValidTill]
        );
    }

    // 4. Fetch updated credits
    const updated = await db.clientQuery(
        client_schema,
        `SELECT 
            total_interview_credits as totalInterviews,
            utilized_interview_credits as utilizedInterviews,
            total_position_credits as totalPositions,
            utilized_position_credits as utilizedPositions,
            valid_till as validTill,
            is_active as isActive
         FROM credits WHERE is_active = 1 LIMIT 1`,
        []
    );

    return {
        success: true,
        message: 'College credits added successfully',
        adminId,
        adminEmail: email,
        type: 'COLLEGE',
        creditsAdded: {
            interview: safeInterviewCredits,
            position: safePositionCredits,
            screening: 0
        },
        creditsAfter: updated[0] || {}
    };
};

/**
 * Add credits for ATS admin (recruitment with screening and jobs)
 * @param {string} adminId - Admin user ID
 * @param {number} interviewCredits - Interview credits to add
 * @param {number} positionCredits - Position credits to add (for jobs)
 * @param {number} screeningCredits - Screening credits to add
 * @param {number} screeningCreditsMin - Minimum screening credits
 * @param {number} screeningCreditsCost - Cost per screening credit
 * @param {string} validTill - Credit validity date (YYYY-MM-DD)
 * @param {object} paymentDetails - Optional payment tracking details
 */
const addAtsCredits = async (
    adminId,
    interviewCredits,
    positionCredits,
    screeningCredits,
    screeningCreditsMin,
    screeningCreditsCost,
    validTill,
    paymentDetails = {}
) => {
    if (!adminId) throw new Error('Admin ID is required');
    if (!interviewCredits && !positionCredits && !screeningCredits) {
        throw new Error('At least one credit type (interview, position, or screening) is required');
    }

    console.log(`[CreditsService.addAtsCredits] Attempting to add credits for ATS admin ${adminId}`);

    // Sanitize inputs
    const safeInterviewCredits = interviewCredits ?? 0;
    const safePositionCredits = positionCredits ?? 0;
    const safeScreeningCredits = screeningCredits ?? 0;
    const safeScreeningMin = screeningCreditsMin ?? null;
    const safeScreeningCost = screeningCreditsCost ?? 0;
    const safeValidTill = validTill ?? null;
    const { paymentMethod = null, paymentId = null, receivedBy = null, paymentDate = null } = paymentDetails;

    // 1. Verify admin exists and is ATS role — from auth_db
    const adminRows = await db.authQuery(
        `SELECT u.id, u.client as client_schema, u.email, r.code as role_code
         FROM auth_db.users u
         LEFT JOIN auth_db.roles r ON u.role_id = r.id
         WHERE u.id = ? AND u.is_admin = 1`,
        [adminId]
    );

    if (adminRows.length === 0) {
        throw new Error('Admin not found');
    }

    const { client_schema, email, role_code } = adminRows[0];

    if (role_code !== 'ATS') {
        throw new Error(`This endpoint is for ATS admins only. User has role: ${role_code}`);
    }

    if (!client_schema) {
        throw new Error('Client schema not found for this admin');
    }

    console.log(`[CreditsService] ATS admin: ${email}, Schema: ${client_schema}`);

    // 2. Get current credits before update
    let before = { 
        total_interview_credits: 0, 
        total_position_credits: 0,
        total_screening_credits: 0 
    };
    try {
        const existing = await db.clientQuery(
            client_schema,
            `SELECT total_interview_credits, total_position_credits, total_screening_credits
             FROM credits WHERE is_active = 1 LIMIT 1`,
            []
        );
        before = existing[0] || before;
    } catch (err) {
        console.warn(`[CreditsService] Could not fetch current credits for ${client_schema}, will create default`);
    }

    // 3. Update or insert credits (ATS schema - with screening)
    const updateSql = `UPDATE credits SET 
        total_interview_credits = total_interview_credits + ?,
        total_position_credits = total_position_credits + ?,
        total_screening_credits = total_screening_credits + ?,
        screening_credits_min = ?,
        screening_credits_cost_per_price = ?,
        valid_till = ?,
        updated_at = NOW()
        WHERE is_active = 1
        LIMIT 1`;

    try {
        await db.clientQuery(
            client_schema,
            updateSql,
            [
                safeInterviewCredits,
                safePositionCredits,
                safeScreeningCredits,
                safeScreeningMin,
                safeScreeningCost,
                safeValidTill
            ]
        );
    } catch (err) {
        console.error(`[CreditsService] Update failed: ${err.message}, attempting insert`);
        // If update fails, insert new record
        const creditsId = uuidv4();
        const idBuffer = Buffer.from(creditsId.replace(/-/g, ''), 'hex');
        const orgIdBuffer = Buffer.from('00000000000000000000000000000000', 'hex');

        await db.clientQuery(
            client_schema,
            `INSERT INTO credits (
                id, organization_id,
                total_interview_credits, utilized_interview_credits,
                total_position_credits, utilized_position_credits,
                total_screening_credits, utilized_screening_credits,
                screening_credits_min, screening_credits_cost_per_price,
                valid_till, is_active,
                created_at, updated_at
            ) VALUES (?, ?, ?, 0, ?, 0, ?, 0, ?, ?, ?, 1, NOW(), NOW())`,
            [
                idBuffer, orgIdBuffer,
                safeInterviewCredits, safePositionCredits,
                safeScreeningCredits,
                safeScreeningMin, safeScreeningCost,
                safeValidTill
            ]
        );
    }

    // 4. Fetch updated credits
    const updated = await db.clientQuery(
        client_schema,
        `SELECT 
            total_interview_credits as totalInterviews,
            utilized_interview_credits as utilizedInterviews,
            total_position_credits as totalPositions,
            utilized_position_credits as utilizedPositions,
            total_screening_credits as totalScreening,
            utilized_screening_credits as utilizedScreening,
            screening_credits_min as screeningMin,
            screening_credits_cost_per_price as screeningCost,
            valid_till as validTill,
            is_active as isActive
         FROM credits WHERE is_active = 1 LIMIT 1`,
        []
    );

    return {
        success: true,
        message: 'ATS credits added successfully',
        adminId,
        adminEmail: email,
        type: 'ATS',
        creditsAdded: {
            interview: safeInterviewCredits,
            position: safePositionCredits,
            screening: safeScreeningCredits,
            screeningMin: safeScreeningMin,
            screeningCost: safeScreeningCost
        },
        creditsAfter: updated[0] || {}
    };
};

module.exports = {
    addCollegeCredits,
    addAtsCredits
};
