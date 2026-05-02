const axios = require('axios');
const https = require('https');
const config = require('../config');
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const paymentService = require('./paymentService');
const subscriptionService = require('./subscriptionService');
const { formatDate } = require('../utils/helpers');

const buildAdminBackendCandidates = () => {
    const base = String(config.adminBackendUrl || '').trim().replace(/\/+$/, '');
    const urls = [];
    if (base) urls.push(base);

    // Local dev fallback: if configured for HTTPS localhost, also try HTTP app port.
    if (/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base)) {
        urls.push('http://localhost:8002');
        urls.push('http://127.0.0.1:8002');
    }

    return [...new Set(urls)];
};

const isLocalHttps = (url) => /^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);

const postAdminBackend = async (path, payload, timeoutMs) => {
    const candidates = buildAdminBackendCandidates();
    if (candidates.length === 0) {
        throw new Error('ADMIN_BACKEND_URL is not configured');
    }

    let lastError = null;
    for (const baseUrl of candidates) {
        try {
            const response = await axios.post(
                `${baseUrl}${path}`,
                payload,
                {
                    headers: {
                        'X-Service-Token': config.service.internalToken,
                        'Content-Type': 'application/json'
                    },
                    timeout: timeoutMs,
                    ...(isLocalHttps(baseUrl)
                        ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) }
                        : {})
                }
            );
            return response;
        } catch (error) {
            lastError = error;
            const reason = error.response?.data?.message || error.message;
            console.warn(`[SuperadminService] AdminBackend call failed via ${baseUrl}: ${reason}`);
        }
    }

    if (lastError?.response) {
        const err = new Error(lastError.response.data?.message || 'Failed to call AdminBackend');
        err.status = lastError.response.status;
        throw err;
    }

    throw new Error('AdminBackend service unavailable');
};

// Generate a random password
const generatePassword = () => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
};

// Map database record to CreditsResponseDto
const mapToCreditsResponse = (credits) => {
    if (!credits) {
        // Return default empty response when no credits found
        return {
            id: null,
            totalInterviewCredits: 0,
            utilizedInterviewCredits: 0,
            remainingInterviewCredits: 0,
            totalPositionCredits: 0,
            utilizedPositionCredits: 0,
            remainingPositionCredits: 0,
            totalScreeningCredits: 0,
            utilizedScreeningCredits: 0,
            remainingScreeningCredits: 0,
            validTill: null,
            isActive: false,
            expired: null,
            canConsumeInterviewCredit: false,
            canConsumePositionCredit: false,
            createdAt: null,
            updatedAt: null
        };
    }

    const validTill = credits.valid_till ? new Date(credits.valid_till) : null;
    const now = new Date();
    const isExpired = validTill && validTill < now;
    const isActive = !!credits.is_active;

    const remainingInterview = credits.remaining_interview_credits ||
        ((credits.total_interview_credits || 0) - (credits.utilized_interview_credits || 0));
    const remainingPosition = credits.remaining_position_credits ||
        ((credits.total_position_credits || 0) - (credits.utilized_position_credits || 0));
    const remainingScreening = credits.remaining_screening_credits ||
        ((credits.total_screening_credits || 0) - (credits.utilized_screening_credits || 0));

    return {
        id: credits.id ? (typeof credits.id === 'string' ? credits.id : credits.id.toString('hex')) : null,
        organizationId: credits.admin_user_id,
        totalInterviewCredits: credits.total_interview_credits || 0,
        utilizedInterviewCredits: credits.utilized_interview_credits || 0,
        remainingInterviewCredits: remainingInterview || 0,
        totalPositionCredits: credits.total_position_credits || 0,
        utilizedPositionCredits: credits.utilized_position_credits || 0,
        remainingPositionCredits: remainingPosition || 0,
        totalScreeningCredits: credits.total_screening_credits || 0,
        utilizedScreeningCredits: credits.utilized_screening_credits || 0,
        remainingScreeningCredits: remainingScreening || 0,
        validTill: formatDate(credits.valid_till),
        isActive,
        expired: isExpired,
        canConsumeInterviewCredit: isActive && !isExpired && remainingInterview > 0,
        canConsumePositionCredit: isActive && !isExpired && remainingPosition > 0,
        createdAt: formatDate(credits.created_at),
        updatedAt: formatDate(credits.updated_at)
    };
};

const createAdminViaBackend = async (adminData) => {
    try {
        // Auto-generate password if not provided
        if (!adminData.password) {
            adminData.password = generatePassword();
        }

        const response = await postAdminBackend('/admins/create', adminData, 30000);

        return response.data.data;
    } catch (error) {
        console.error('[SuperadminService] Error calling AdminBackend:', error.message);

        if (error.response) {
            const err = new Error(error.response.data.message || 'Failed to create admin');
            err.status = error.response.status;
            throw err;
        }

        throw new Error('AdminBackend service unavailable');
    }
};

const provisionAdminSchema = async (adminId) => {
    try {
        const response = await postAdminBackend(
            '/admins/provision',
            { adminId },
            60000 // Provisioning might take longer (schema creation + initialization)
        );

        return response.data;
    } catch (error) {
        console.error('[SuperadminService] Error calling AdminBackend provision:', error.message);
        if (error.response) {
            const err = new Error(error.response.data.message || 'Failed to provision admin schema');
            err.status = error.response.status;
            throw err;
        }
        throw new Error('AdminBackend service unavailable');
    }
};

const getAdmins = async ({ page = 1, limit = 20, search = '', status = [], type = '', ats = '', createdFrom = '', createdTo = '', sortOrder = 'NEWEST_TO_OLDEST' } = {}) => {
    // Ensure page and limit are proper numbers
    const safePage = Number.isInteger(page) && page > 0 ? page : (parseInt(page, 10) > 0 ? parseInt(page, 10) : 1);
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : (parseInt(limit, 10) > 0 ? Math.min(parseInt(limit, 10), 100) : 20);
    const offset = (safePage - 1) * safeLimit;

    const countParams = [];
    const selectParams = [];

    let whereClause = 'WHERE u.is_admin = 1 AND u.client IS NOT NULL';

    if (status && status.length > 0) {
        const statuses = Array.isArray(status) ? status : [status];
        const placeholders = statuses.map(() => '?').join(',');
        whereClause += ` AND u.is_active IN (${placeholders})`;
        statuses.forEach(s => {
            const val = s.toLowerCase() === 'active' ? 1 : 0;
            countParams.push(val);
            selectParams.push(val);
        });
    }
    if (createdFrom) {
        whereClause += ' AND u.created_at >= ?';
        countParams.push(createdFrom);
        selectParams.push(createdFrom);
    }
    if (createdTo) {
        whereClause += ' AND u.created_at <= ?';
        countParams.push(createdTo + ' 23:59:59');
        selectParams.push(createdTo + ' 23:59:59');
    }
    if (type) {
        // Filter by role: 'college' -> ADMIN role, 'recruiter' -> ATS role
        const roleCode = type.toLowerCase() === 'college' ? 'ADMIN' : 'ATS';
        whereClause += ' AND EXISTS (SELECT 1 FROM auth_db.roles r2 WHERE r2.id = u.role_id AND r2.code = ?)';
        countParams.push(roleCode);
        selectParams.push(roleCode);
    }
    if (search) {
        const like = `%${search}%`;
        whereClause += ' AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.client LIKE ?)';
        countParams.push(like, like, like, like);
        selectParams.push(like, like, like, like);
    }

    const countRows = await db.authQuery(
        `SELECT COUNT(*) AS total FROM auth_db.users u ${whereClause}`,
        countParams
    );

    let orderBySql = 'u.created_at DESC';
    if (sortOrder === 'OLDEST_TO_NEWEST') orderBySql = 'u.created_at ASC';
    if (sortOrder === 'NAME_ASC') orderBySql = 'u.first_name ASC, u.last_name ASC';
    if (sortOrder === 'NAME_DESC') orderBySql = 'u.first_name DESC, u.last_name DESC';

    // Use string interpolation for LIMIT and OFFSET (already validated integers) — always auth_db
    const selectQuery = `SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number, u.is_active, u.client, u.created_at, r.code as role_code FROM auth_db.users u LEFT JOIN auth_db.roles r ON u.role_id = r.id ${whereClause} ORDER BY ${orderBySql} LIMIT ${safeLimit} OFFSET ${offset}`;

    const rows = await db.authQuery(selectQuery, selectParams);

    // Fetch credit status for each admin
    const itemsWithStatus = await Promise.all(rows.map(async (row) => {
        let credit_status = 'NOT_ADDED';

        if (row.client) {
            try {
                // Use the full client schema name (e.g. qwikhire_mlzdarp5) as the DB name
                const clientSchema = row.client;
                const creditsTable = 'credits'; // Both ATS and College use 'credits' table
                const isAtsRole = row.role_code === 'ATS';
                const credits = await db.clientQuery(
                    clientSchema,
                    `SELECT total_interview_credits AS int_tot, total_position_credits AS pos_tot, 
                     ${isAtsRole ? 'total_screening_credits' : '0'} AS scr_tot, valid_till 
                     FROM ${creditsTable} WHERE is_active = 1 LIMIT 1`,
                    []
                );

                if (credits && credits.length > 0) {
                    const c = credits[0];
                    const hasTotal = c.int_tot > 0 || c.pos_tot > 0 || c.scr_tot > 0;

                    if (hasTotal) {
                        const isValid = !c.valid_till || new Date(c.valid_till) > new Date();
                        // Backend only tracks totals in this db schema (consumed tracking is app level)
                        // If it has totals and is valid, it's ADDED. If it's expired, it's OVER.
                        credit_status = isValid ? 'ADDED' : 'OVER';
                    }
                }
            } catch (err) {
                // If client DB doesn't exist yet or query fails, leave as NOT_ADDED
                console.warn(`Failed to fetch credits for ${row.client}:`, err.message);
            }
        }

        return { ...row, credit_status };
    }));

    return {
        items: itemsWithStatus,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total: countRows[0]?.total || 0
        }
    };
};

const updateAdminStatus = async (adminId, isActive) => {
    if (!adminId) throw new Error('Admin ID is required');

    await db.authQuery(
        `UPDATE auth_db.users SET is_active = ?, updated_at = NOW() WHERE id = ? AND is_admin = 1`,
        [isActive ? 1 : 0, adminId]
    );

    return { adminId, isActive };
};

const updateAdmin = async (adminId, updateData) => {
    if (!adminId) throw new Error('Admin ID is required');

    const { firstName, lastName, phoneNumber, roleId } = updateData;

    const updates = [];
    const params = [];

    if (firstName !== undefined) {
        updates.push('first_name = ?');
        params.push(firstName);
    }
    if (lastName !== undefined) {
        updates.push('last_name = ?');
        params.push(lastName);
    }
    if (phoneNumber !== undefined) {
        updates.push('phone_number = ?');
        params.push(phoneNumber);
    }
    // is_college and is_ats are deprecated - use roleId instead
    if (roleId !== undefined) {
        updates.push('role_id = ?');
        params.push(roleId);
    }
    if (updateData.isSubscription !== undefined) {
        updates.push('is_subscribed = ?');
        params.push(updateData.isSubscription ? 1 : 0);
    }

    if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        params.push(adminId);

        await db.authQuery(
            `UPDATE auth_db.users SET ${updates.join(', ')} WHERE id = ? AND is_admin = 1`,
            params
        );
    }

    return { adminId, message: 'Admin updated successfully' };
};

const addCredits = async (
    adminId,
    totalInterviewCredits,
    totalPositionCredits,
    totalScreeningCredits,
    screeningCreditsMin,
    screeningCreditsCostPerPrice,
    validTill,
    paymentDetails = {}
) => {
    if (!adminId) {
        throw new Error('Admin ID is required');
    }

    // Nullify ALL optional values — mysql2 rejects undefined strictly
    const {
        paymentMethod = null,
        paymentId: txId = null,
        receivedBy = null,
        paymentDate = null,
        discountCoupon = null,
        isManual = false,
        totalAmount = null,
        billingCycle = null,
        atomic = false
    } = paymentDetails || {};

    const transactionId = txId ?? null;
    const safePaymentMethod = paymentMethod ?? null;
    const safeReceivedBy = receivedBy ?? null;
    const safePaymentDate = paymentDate ?? null;
    const safeDiscountCoupon = discountCoupon ?? null;
    const safeTotalAmount = totalAmount ?? 0;
    const safeScreeningMin = screeningCreditsMin ?? null;
    const safeScreeningCost = screeningCreditsCostPerPrice ?? null;
    const safeValidTill = validTill ?? null;
    const safeInterviewCredits = totalInterviewCredits ?? 0;
    const safePositionCredits = totalPositionCredits ?? 0;
    const safeScreeningCredits = totalScreeningCredits ?? 0;

    // 1. Get the admin's details from auth_db including role
    const adminRows = await db.authQuery(
        `SELECT u.client as client_schema, u.email, r.code as role_code 
         FROM auth_db.users u 
         LEFT JOIN auth_db.roles r ON u.role_id = r.id 
         WHERE u.id = ? AND u.is_admin = 1`,
        [adminId]
    );

    if (adminRows.length === 0) {
        throw new Error('Admin not found');
    }

    const clientSchema = adminRows[0].client_schema;
    const adminEmail = adminRows[0].email;
    const roleCode = adminRows[0].role_code;
    const isAtsRole = roleCode === 'ATS';
    
    console.log(`[SuperadminService.addCredits] Admin role: ${roleCode}, isATS: ${isAtsRole}`);
    
    if (!clientSchema) {
        throw new Error('Client schema not found for this admin');
    }

    // 2. Load current active credits from client DB and prepare immutable-version insert
    const creditsTable = 'credits';
    const zeroUuidBuffer = Buffer.from('00000000000000000000000000000000', 'hex');

    const normalizeUuidBuffer = (value, fallback = zeroUuidBuffer) => {
        if (Buffer.isBuffer(value) && value.length === 16) return value;
        if (!value) return fallback;
        const raw = String(value).replace(/-/g, '').trim();
        if (/^[0-9a-fA-F]{32}$/.test(raw)) return Buffer.from(raw, 'hex');
        return fallback;
    };

    let activeCredits = null;
    let before = { total_interview_credits: 0, total_position_credits: 0, total_screening_credits: 0 };

    const loadActiveCredits = async () => {
        const selectFields = isAtsRole
            ? `id, organization_id,
               total_interview_credits, utilized_interview_credits,
               total_position_credits, utilized_position_credits,
               total_screening_credits, utilized_screening_credits,
               screening_credits_min, screening_credits_cost_per_price,
               valid_till`
            : `id, organization_id,
               total_interview_credits, utilized_interview_credits,
               total_position_credits, utilized_position_credits,
               valid_till`;

        const rows = await db.clientQuery(
            clientSchema,
            `SELECT ${selectFields}
             FROM ${creditsTable}
             WHERE is_active = 1
             ORDER BY updated_at DESC, created_at DESC
             LIMIT 1`,
            []
        );
        return rows[0] || null;
    };

    try {
        activeCredits = await loadActiveCredits();
    } catch (err) {
        console.warn(`[SuperadminService] Credits lookup failed for ${clientSchema}, attempting to provision schema...`);
        await provisionAdminSchema(adminId);
        activeCredits = await loadActiveCredits();
    }

    if (activeCredits) {
        before = {
            total_interview_credits: Number(activeCredits.total_interview_credits || 0),
            total_position_credits: Number(activeCredits.total_position_credits || 0),
            total_screening_credits: Number(activeCredits.total_screening_credits || 0)
        };
    }
    if (!isAtsRole) before.total_screening_credits = 0;

    // 3. Versioned write: deactivate current active row(s), then insert a new active row
    const insertNewActiveCredits = async () => {
        const newCreditId = Buffer.from(uuidv4().replace(/-/g, ''), 'hex');
        const organizationId = normalizeUuidBuffer(activeCredits?.organization_id, normalizeUuidBuffer(adminId));

        const prevInterviewTotal = Number(activeCredits?.total_interview_credits || 0);
        const prevInterviewUsed = Number(activeCredits?.utilized_interview_credits || 0);
        const prevPositionTotal = Number(activeCredits?.total_position_credits || 0);
        const prevPositionUsed = Number(activeCredits?.utilized_position_credits || 0);
        const prevScreeningTotal = Number(activeCredits?.total_screening_credits || 0);
        const prevScreeningUsed = Number(activeCredits?.utilized_screening_credits || 0);

        const nextInterviewTotal = prevInterviewTotal + safeInterviewCredits;
        const nextPositionTotal = prevPositionTotal + safePositionCredits;
        const nextScreeningTotal = prevScreeningTotal + safeScreeningCredits;

        const nextValidTill = safeValidTill ?? activeCredits?.valid_till ?? null;
        const nextScreeningMin = safeScreeningMin ?? activeCredits?.screening_credits_min ?? null;
        const nextScreeningCost = safeScreeningCost ?? activeCredits?.screening_credits_cost_per_price ?? null;

        if (activeCredits) {
            await db.clientQuery(
                clientSchema,
                `UPDATE ${creditsTable}
                 SET is_active = 0, updated_at = NOW()
                 WHERE is_active = 1`,
                []
            );
        }

        if (isAtsRole) {
            await db.clientQuery(
                clientSchema,
                `INSERT INTO ${creditsTable} (
                    id, organization_id,
                    total_interview_credits, utilized_interview_credits,
                    total_position_credits, utilized_position_credits,
                    total_screening_credits, utilized_screening_credits,
                    screening_credits_min, screening_credits_cost_per_price,
                    valid_till, is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
                [
                    newCreditId, organizationId,
                    nextInterviewTotal, prevInterviewUsed,
                    nextPositionTotal, prevPositionUsed,
                    nextScreeningTotal, prevScreeningUsed,
                    nextScreeningMin, nextScreeningCost,
                    nextValidTill
                ]
            );
        } else {
            await db.clientQuery(
                clientSchema,
                `INSERT INTO ${creditsTable} (
                    id, organization_id,
                    total_interview_credits, utilized_interview_credits,
                    total_position_credits, utilized_position_credits,
                    valid_till, is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
                [
                    newCreditId, organizationId,
                    nextInterviewTotal, prevInterviewUsed,
                    nextPositionTotal, prevPositionUsed,
                    nextValidTill
                ]
            );
        }
    };

    try {
        await insertNewActiveCredits();
    } catch (err) {
        console.warn(`[SuperadminService] Client credits versioned write failed for ${clientSchema}, attempting to provision schema...`);
        await provisionAdminSchema(adminId);
        activeCredits = await loadActiveCredits();
        await insertNewActiveCredits();
    }

    // Write credit history (always — even in atomic mode)
    const { v4: uuidv4HistId } = require('uuid');
    const historyId = uuidv4HistId();
    const historyIdBuffer = Buffer.from(historyId.replace(/-/g, ''), 'hex');
    await db.query(
        `INSERT INTO credits_history (
            id, client_schema, admin_user_id, change_type,
            interview_credits_change, position_credits_change, screening_credits_change,
            interview_credits_before, interview_credits_after,
            position_credits_before, position_credits_after,
            screening_credits_before, screening_credits_after,
            notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
            historyIdBuffer, clientSchema, adminId, 'PURCHASE',
            safeInterviewCredits, safePositionCredits, safeScreeningCredits,
            before.total_interview_credits,
            before.total_interview_credits + safeInterviewCredits,
            before.total_position_credits,
            before.total_position_credits + safePositionCredits,
            before.total_screening_credits,
            before.total_screening_credits + safeScreeningCredits,
            `Credits purchased. Method: ${safePaymentMethod || 'MANUAL'}. Ref: ${txId || 'N/A'}`
        ]
    ).catch(err => console.error('Failed to write credit history:', err.message));

    // Common function to get updated credits for response
    const fetchUpdatedCredits = async () => {
        const rows = await db.clientQuery(
            clientSchema,
            `SELECT * FROM ${creditsTable} WHERE is_active = 1 LIMIT 1`,
            []
        );
        if (rows[0]) {
            // Add back admin_user_id for mapper (it's called organization_id in client DB)
            rows[0].admin_user_id = adminId;
        }
        return rows[0];
    };

    // If atomic mode, stop here (frontend handles subscription/payment/user-sync steps)
    if (atomic) {
        const updatedCredits = await fetchUpdatedCredits();
        return {
            success: true,
            message: 'Credits updated (atomic)',
            id: updatedCredits?.id ? (typeof updatedCredits.id === 'string' ? updatedCredits.id : updatedCredits.id.toString('hex')) : null,
            adminId,
            clientSchema,
            totalInterviewCredits: updatedCredits?.total_interview_credits || 0,
            totalPositionCredits: updatedCredits?.total_position_credits || 0,
            totalScreeningCredits: updatedCredits?.total_screening_credits || 0,
            screeningCreditsMin: safeScreeningMin,
            screeningCreditsCostPerPrice: safeScreeningCost,
            totalAmount: safeTotalAmount
        };
    }

    // Step 2: Post Subscription (Pending)
    const subscriptionData = {
        organizationId: adminId,
        totalInterviewCredits: safeInterviewCredits,
        totalPositionCredits: safePositionCredits,
        interviewCreditsPrice: safeInterviewCredits > 0 ? (safeTotalAmount / safeInterviewCredits) : 0,
        positionCreditsPrice: safePositionCredits > 0 ? (safeTotalAmount / safePositionCredits) : 0,
        validityDays: Math.ceil((new Date(safeValidTill) - new Date()) / (1000 * 60 * 60 * 24)) || 365,
        billingCycle: billingCycle || 'ANNUAL',
        paymentMethod: safePaymentMethod,
        paymentStatus: isManual ? 'COMPLETED' : 'PENDING',
        validFrom: safePaymentDate || new Date(),
        validUntil: safeValidTill,
        discountCode: safeDiscountCoupon,
        skipPayment: isManual // Skip auto-payment for manual sequence orchestration
    };

    const subscription = await subscriptionService.createSubscription(subscriptionData);

    if (isManual) {
        // Step 3: Post Payment (Manual)
        const paymentData = {
            clientSchema: clientSchema,
            adminUserId: adminId,
            adminEmail: adminEmail,
            paymentType: 'SUBSCRIPTION',
            amount: safeTotalAmount,
            currency: 'INR',
            interviewCreditsAdded: safeInterviewCredits,
            position_credits_added: safePositionCredits, // Fixed field name inconsistency if any
            screeningCreditsAdded: safeScreeningCredits,
            validityExtendedDays: subscriptionData.validityDays,
            paymentMethod: safePaymentMethod,
            paymentStatus: 'COMPLETED',
            transactionId: transactionId,
            paymentDate: safePaymentDate || new Date(),
            invoiceNumber: null
        };

        const payment = await paymentService.createPayment(paymentData);

        // Step 4: Put Subscription (Update with paymentId and activate)
        await subscriptionService.updateSubscription(subscription.id, {
            paymentId: payment.id,
            isSubscription: true,
            status: 'ACTIVE'
        });

        // Final Step: Confirm Payment (updates user in auth_db, records history, syncs credits)
        if (payment.id) {
            await subscriptionService.confirmPayment(payment.id, {
                transactionId,
                receivedBy: safeReceivedBy,
                notes: `Manual allocation by Superadmin. Reference: ${safeDiscountCoupon || 'N/A'}`
            });
        }
    }

    const finalCredits = await fetchUpdatedCredits();
    return mapToCreditsResponse(finalCredits);
};

const getAdminCredits = async (adminId) => {
    if (!adminId) throw new Error('Admin ID is required');

    console.log(`[SuperadminService.getAdminCredits] Fetching credits for adminId=${adminId}`);

    const adminRows = await db.authQuery(
        `SELECT u.client as client_schema, r.code as role_code 
         FROM auth_db.users u 
         LEFT JOIN auth_db.roles r ON u.role_id = r.id 
         WHERE u.id = ? AND u.is_admin = 1`,
        [adminId]
    );

    if (adminRows.length === 0) throw new Error('Admin not found');

    const clientSchema = adminRows[0].client_schema;
    const roleCode = adminRows[0].role_code;
    const isAtsRole = roleCode === 'ATS';
    
    console.log(`[SuperadminService.getAdminCredits] Client schema: ${clientSchema || 'NULL'}, Role: ${roleCode}`);

    if (!clientSchema) {
        console.warn(`[SuperadminService.getAdminCredits] No client schema for admin ${adminId}`);
        return mapToCreditsResponse(null);
    }

    try {
        // Build SELECT fields based on role (ATS has screening, College doesn't)
        const selectFields = isAtsRole
            ? `id,
                total_interview_credits,
                utilized_interview_credits,
                total_position_credits,
                utilized_position_credits,
                total_screening_credits,
                utilized_screening_credits,
                valid_till,
                is_active,
                created_at,
                updated_at`
            : `id,
                total_interview_credits,
                utilized_interview_credits,
                total_position_credits,
                utilized_position_credits,
                valid_till,
                is_active,
                created_at,
                updated_at`;
        
        // Both ATS and College use 'credits' table in tenant DBs
        const creditsTable = 'credits';
        
        // Query tenant DB directly for credits
        const rows = await db.clientQuery(
            clientSchema,
            `SELECT ${selectFields}
             FROM ${creditsTable}
             WHERE is_active = 1 
             ORDER BY created_at DESC 
             LIMIT 1`,
            []
        );

        console.log(`[SuperadminService.getAdminCredits] Query returned ${rows?.length || 0} rows`);
        
        if (rows && rows.length > 0) {
            const credits = rows[0];
            credits.admin_user_id = adminId; // Add for mapper
            // Set screening to 0 for College roles
            if (!isAtsRole) {
                credits.total_screening_credits = 0;
                credits.utilized_screening_credits = 0;
            }
            console.log(`[SuperadminService.getAdminCredits] Found credits:`, {
                totalInterview: credits.total_interview_credits,
                totalPosition: credits.total_position_credits,
                totalScreening: credits.total_screening_credits || 0,
                isActive: credits.is_active
            });
            return mapToCreditsResponse(credits);
        } else {
            console.warn(`[SuperadminService.getAdminCredits] No active credits found for admin ${adminId} in schema ${clientSchema}`);
            return mapToCreditsResponse(null);
        }
    } catch (error) {
        console.error(`[SuperadminService.getAdminCredits] Error fetching credits:`, error.message);
        return mapToCreditsResponse(null);
    }
};

const getAdminDetails = async (adminId) => {
    if (!adminId) throw new Error('Admin ID is required');

    const adminRows = await db.authQuery(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number, u.is_active, u.is_subscribed, u.is_hold, u.client as client_schema, u.created_at, u.last_login_at, u.role_id, r.code as role_code
         FROM auth_db.users u
         LEFT JOIN auth_db.roles r ON u.role_id = r.id
         WHERE u.id = ? AND u.is_admin = 1`,
        [adminId]
    );

    if (adminRows.length === 0) throw new Error('Admin not found');
    const admin = adminRows[0];

    return {
        profile: {
            id: admin.id,
            email: admin.email,
            firstName: admin.first_name,
            lastName: admin.last_name,
            phoneNumber: admin.phone_number,
            isActive: !!admin.is_active,
            isSubscribed: !!admin.is_subscribed,
            isHold: !!admin.is_hold,
            roleId: admin.role_id,
            roleCode: admin.role_code,
            clientSchema: admin.client_schema,
            createdAt: admin.created_at,
            lastLoginAt: admin.last_login_at
        }
    };
};

const getAdminStats = async (adminId) => {
    if (!adminId) throw new Error('Admin ID is required');

    // Get admin's client schema and role
    const adminRows = await db.authQuery(
        `SELECT u.client as client_schema, r.code as role_code 
         FROM auth_db.users u 
         LEFT JOIN auth_db.roles r ON u.role_id = r.id 
         WHERE u.id = ? AND u.is_admin = 1`,
        [adminId]
    );
    if (adminRows.length === 0) throw new Error('Admin not found');
    const clientSchema = adminRows[0].client_schema;
    const roleCode = adminRows[0].role_code;
    const isAtsRole = roleCode === 'ATS';

    // Job stats from superadmin_db
    const jobStats = await db.query(
        `SELECT COUNT(*) as total_jobs,
                SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_jobs,
                SUM(applications_count) as total_applications
         FROM jobs WHERE admin_user_id = ?`,
        [adminId]
    );

    let totalCandidates = 0, totalInterviews = 0, totalPositions = 0;

    if (clientSchema) {
        try {
            // ATS role has jobs table, College role has positions table
            const [candidates, positionsOrJobs, interviews] = await Promise.all([
                db.clientQuery(clientSchema, 'SELECT COUNT(*) as total FROM candidates', []),
                db.clientQuery(
                    clientSchema, 
                    isAtsRole 
                        ? 'SELECT COUNT(*) as total FROM jobs' 
                        : 'SELECT COUNT(*) as total FROM positions', 
                    []
                ),
                db.clientQuery(clientSchema, 'SELECT COUNT(*) as total FROM interview_evaluations', []),
            ]);
            totalCandidates = candidates[0]?.total || 0;
            totalPositions = positionsOrJobs[0]?.total || 0;
            totalInterviews = interviews[0]?.total || 0;
        } catch (err) {
            console.warn(`Stats fetch failed for ${clientSchema}:`, err.message);
        }
    }

    return {
        totalCandidates,
        totalInterviews,
        totalPositions,
        totalJobs: jobStats[0]?.total_jobs || 0,
        openJobs: jobStats[0]?.open_jobs || 0,
        totalApplications: jobStats[0]?.total_applications || 0
    };
};

const getAdminPayments = async (adminId) => {
    if (!adminId) throw new Error('Admin ID is required');
    return paymentService.getPaymentsByAdmin(adminId);
};

const getAdminCreditHistory = async (adminId) => {
    if (!adminId) throw new Error('Admin ID is required');

    console.log(`[SuperadminService.getAdminCreditHistory] Fetching history for adminId=${adminId}`);

    // Get admin's client schema and role
    const adminRows = await db.authQuery(
        `SELECT u.client as client_schema, r.code as role_code 
         FROM auth_db.users u 
         LEFT JOIN auth_db.roles r ON u.role_id = r.id 
         WHERE u.id = ? AND u.is_admin = 1`,
        [adminId]
    );

    if (adminRows.length === 0) throw new Error('Admin not found');

    const clientSchema = adminRows[0].client_schema;
    const roleCode = adminRows[0].role_code;
    const isAtsRole = roleCode === 'ATS';
    
    console.log(`[SuperadminService.getAdminCreditHistory] Client schema: ${clientSchema || 'NULL'}, Role: ${roleCode}`);

    if (!clientSchema) {
        console.warn(`[SuperadminService.getAdminCreditHistory] No client schema, returning empty history`);
        return [];
    }

    try {
        // Build SELECT fields based on role (ATS has screening, College doesn't)
        const selectFields = isAtsRole
            ? `id,
                total_interview_credits,
                utilized_interview_credits,
                total_position_credits,
                utilized_position_credits,
                total_screening_credits,
                utilized_screening_credits,
                valid_till,
                is_active,
                created_at,
                updated_at`
            : `id,
                total_interview_credits,
                utilized_interview_credits,
                total_position_credits,
                utilized_position_credits,
                valid_till,
                is_active,
                created_at,
                updated_at`;
        
        // Both ATS and College use 'credits' table in tenant DBs
        const creditsTable = 'credits';
        
        // Query tenant DB for ALL credit allocations (active and inactive) to show complete history
        const rows = await db.clientQuery(
            clientSchema,
            `SELECT ${selectFields}
             FROM ${creditsTable}
             ORDER BY created_at DESC`,
            []
        );

        console.log(`[SuperadminService.getAdminCreditHistory] Found ${rows?.length || 0} allocation records`);

        // Map to response format
        return rows.map(credit => {
            credit.admin_user_id = adminId; // Add for mapper
            // Set screening to 0 for College roles
            if (!isAtsRole) {
                credit.total_screening_credits = 0;
                credit.utilized_screening_credits = 0;
            }
            return mapToCreditsResponse(credit);
        });
    } catch (error) {
        console.error(`[SuperadminService.getAdminCreditHistory] Error:`, error.message);
        return [];
    }
};

const getSystemRoles = async () => {
    const roles = await db.authQuery(
        `SELECT id, code, name FROM auth_db.roles WHERE is_system = 1 AND LOWER(name) NOT LIKE '%candidate%'`,
        []
    );
    return roles;
};

module.exports = {
    createAdminViaBackend,
    getAdmins,
    updateAdminStatus,
    updateAdmin,
    addCredits,
    getAdminCredits,
    getAdminDetails,
    getAdminStats,
    getAdminPayments,
    getAdminCreditHistory,
    getSystemRoles,
    provisionAdminSchema
};
