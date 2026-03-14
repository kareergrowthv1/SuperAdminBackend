const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { calculateCreditAmount } = require('../config/pricing');
const paymentService = require('./paymentService');
const { formatDate } = require('../utils/helpers');

/**
 * Determine billing cycle based on date difference
 */
const getBillingCycle = (validFrom, validUntil) => {
    if (!validFrom || !validUntil) return 'ANNUAL';

    const start = new Date(validFrom);
    const end = new Date(validUntil);
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    // Usually Monthly is ~30 days, Annual is ~365 days.
    // If > 300 days, consider it Annual.
    return diffDays >= 300 ? 'ANNUAL' : 'MONTHLY';
};

// Map database record to SubscriptionResponse (aligned with Java backend)
const mapToSubscriptionResponse = (data) => {
    if (!data) return null;

    let id = data.subscription_id || data.id;
    if (id && typeof id === 'string' && id.length === 32) {
        id = id.toLowerCase().replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    }

    let paymentId = data.payment_id;
    if (paymentId && typeof paymentId === 'string' && paymentId.length === 32) {
        paymentId = paymentId.toLowerCase().replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    }

    return {
        id,
        organizationId: data.organization_id || data.admin_user_id,
        paymentId,
        subscribedProducts: data.subscribed_products || 'INTERVIEW',
        billingCycle: data.billing_cycle || 'ANNUAL',
        totalInterviewCredits: data.total_interview_credits || 0,
        interviewCreditsPrice: parseFloat(data.interview_credits_price || 0),
        demoInterviewCredits: data.demo_interview_credits || 0,
        totalPositionCredits: data.total_position_credits || 0,
        positionCreditsPrice: parseFloat(data.position_credits_price || 0),
        totalScreeningCredits: data.total_screening_credits || 0,
        screeningCreditsPrice: parseFloat(data.screening_credits_price || 0),
        taxRate: parseFloat(data.tax_rate || 18.00),
        taxInclusive: !!data.tax_inclusive,
        subTotal: parseFloat(data.sub_total || 0),
        totalAmount: parseFloat(data.total_amount || 0),
        grandTotalAmount: parseFloat(data.grand_total_amount || 0),
        validFrom: formatDate(data.valid_from || data.validFrom),
        validUntil: formatDate(data.valid_until || data.validUntil),
        status: data.status || 'ACTIVE',
        subscription: !!data.is_subscription,
        discountPercentage: parseFloat(data.discount_percentage || 0),
        discountAmount: parseFloat(data.discount_amount || 0),
        discountCode: data.discount_code || null,
        createdAt: formatDate(data.created_at),
        updatedAt: formatDate(data.updated_at)
    };
};

/**
 * Create subscription with credits purchase
 */
const createSubscription = async (subscriptionData) => {
    const {
        organizationId,
        paymentId,
        totalInterviewCredits = 0,
        totalPositionCredits = 0,
        totalScreeningCredits = 0,
        interviewCreditsPrice,
        positionCreditsPrice,
        screeningCreditsPrice = 0,
        validityDays = 365,
        billingCycle = 'ANNUAL',
        taxRate = 18.00,
        taxInclusive = false,
        paymentMethod = 'MANUAL',
        discountPercentage = 0,
        discountCode = null,
        subscribedProducts = 'INTERVIEW',
        status = 'ACTIVE',
        subscription = true,
        validFrom: customValidFrom,
        validUntil: customValidUntil,
        paymentStatus = 'PENDING',
        grandTotalAmount: providedGrandTotal   // Accept pre-calculated total from frontend
    } = subscriptionData;

    // 0. Fetch clientSchema and adminEmail if missing
    let clientSchema = subscriptionData.clientSchema;
    let adminEmail = subscriptionData.adminEmail;

    if (!clientSchema || !adminEmail) {
        const adminRows = await db.authQuery(
            `SELECT email, client FROM auth_db.users WHERE id = ?`,
            [organizationId]
        );
        if (adminRows.length === 0) throw new Error('Organization not found');
        adminEmail = adminRows[0].email;
        clientSchema = adminRows[0].client;
    }

    if (!clientSchema) throw new Error('Organization has no client schema assigned');

    // Calculate pricing based on provided prices or default rates
    const pricing = calculateCreditAmount(totalInterviewCredits, totalPositionCredits, taxRate, taxInclusive);

    // Override with specific prices if provided in payload
    const finalInterviewPrice = interviewCreditsPrice !== undefined ? parseFloat(interviewCreditsPrice) : (pricing.interviewPrice || 0);
    const finalPositionPrice = positionCreditsPrice !== undefined ? parseFloat(positionCreditsPrice) : (pricing.positionPrice || 0);
    const finalScreeningPrice = screeningCreditsPrice !== undefined ? parseFloat(screeningCreditsPrice) : 0;

    // Apply discount
    let discountAmount = 0;
    let finalTotal = pricing.grandTotal;

    if (discountPercentage > 0) {
        discountAmount = (pricing.subTotal * discountPercentage) / 100;
        finalTotal = pricing.grandTotal - discountAmount;
    }

    const subscriptionId = uuidv4();
    const validFrom = customValidFrom ? new Date(customValidFrom) : new Date();
    const validUntil = customValidUntil ? new Date(customValidUntil) : new Date(validFrom);
    if (!customValidUntil) validUntil.setDate(validUntil.getDate() + validityDays);

    // 1. Create payment record
    const paymentData = {
        clientSchema,
        adminUserId: organizationId,
        adminEmail,
        paymentType: 'SUBSCRIPTION',
        amount: finalTotal,
        currency: pricing.currency,
        interviewCreditsAdded: totalInterviewCredits,
        positionCreditsAdded: totalPositionCredits,
        validityExtendedDays: validityDays,
        paymentMethod,
        paymentStatus,
        gatewayResponse: { pricing }
    };

    // 1. Create payment record (unless skipped for manual sequence)
    let payment = null;
    if (!subscriptionData.paymentId && !subscriptionData.skipPayment) {
        payment = await paymentService.createPayment(paymentData);
    }

    const finalPaymentId = paymentId || (payment ? payment.id : null);

    // 2. Create subscription record in DB
    const isCompleted = paymentStatus === 'COMPLETED';
    const query = `INSERT INTO subscriptions (
            id, organization_id, payment_id, subscribed_products, billing_cycle,
            total_interview_credits, interview_credits_price, demo_interview_credits,
            total_position_credits, position_credits_price, total_screening_credits,
            screening_credits_price, tax_rate, tax_inclusive, sub_total, total_amount,
            grand_total_amount, valid_from, valid_until, status, discount_percentage,
            discount_amount, discount_code, is_subscription
        ) VALUES (UNHEX(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    // Compute sub_total (before tax), tax amount, grand total (after tax & discounts)
    const subTotal = pricing.subTotal;                                    // pre-tax
    const taxAmount = taxInclusive ? 0 : (subTotal * taxRate) / 100;       // GST amount
    const totalWithTax = subTotal + taxAmount;                                // subtotal + GST
    const grandTotal = providedGrandTotal != null
        ? parseFloat(providedGrandTotal)                                       // use frontend value when provided
        : (finalTotal - discountAmount);                                       // fallback

    const params = [
        subscriptionId.replace(/-/g, ''),
        organizationId,
        finalPaymentId ? Buffer.from(finalPaymentId.replace(/-/g, ''), 'hex') : null,
        subscribedProducts,
        billingCycle,
        totalInterviewCredits, finalInterviewPrice, 0,
        totalPositionCredits, finalPositionPrice,
        totalScreeningCredits, finalScreeningPrice,
        taxRate, taxInclusive ? 1 : 0,
        subTotal,       // sub_total  = before-tax amount
        totalWithTax,   // total_amount = subTotal + GST
        grandTotal,     // grand_total_amount = after discounts
        validFrom, validUntil,
        status, discountPercentage, discountAmount, discountCode, isCompleted ? 1 : 0
    ];

    await db.query(query, params);

    // 3. Mark user as subscribed in auth_db if completed
    if (isCompleted) {
        await db.authQuery(
            `UPDATE auth_db.users SET is_subscribed = 1 WHERE id = ?`,
            [organizationId]
        ).catch(err => console.error('Failed to update subscription status in auth_db:', err.message));
    }

    // Return the mapped response
    const subRows = await db.query("SELECT *, HEX(id) as id, HEX(payment_id) as payment_id FROM subscriptions WHERE id = UNHEX(?)", [subscriptionId.replace(/-/g, '')]);
    return mapToSubscriptionResponse(subRows[0]);
};

/**
 * Purchase additional credits (addon)
 */
const purchaseCredits = async (purchaseData) => {
    const {
        clientSchema,
        adminUserId,
        adminEmail,
        interviewCredits = 0,
        positionCredits = 0,
        validityExtensionDays = 0,
        paymentMethod = 'MANUAL',
        taxRate = 18,
        taxInclusive = false
    } = purchaseData;

    // Validate that at least some credits are being purchased
    if (interviewCredits <= 0 && positionCredits <= 0) {
        const error = new Error('At least one type of credit must be purchased');
        error.status = 400;
        throw error;
    }

    // Calculate pricing
    const pricing = calculateCreditAmount(interviewCredits, positionCredits, taxRate, taxInclusive);

    // Create payment record
    const paymentData = {
        clientSchema,
        adminUserId,
        adminEmail,
        paymentType: interviewCredits > 0 && positionCredits > 0 ? 'ADDON' :
            interviewCredits > 0 ? 'INTERVIEW_CREDITS' : 'POSITION_CREDITS',
        amount: pricing.grandTotal,
        currency: pricing.currency,
        interviewCreditsAdded: interviewCredits,
        positionCreditsAdded: positionCredits,
        validityExtendedDays: validityExtensionDays,
        paymentMethod,
        paymentStatus: 'PENDING',
        gatewayResponse: { pricing }
    };

    const payment = await paymentService.createPayment(paymentData);

    return {
        ...payment,
        pricing
    };
};

/**
 * Get subscription details by client
 */
const getSubscriptionByClient = async (clientSchema) => {
    // 1. Get organizationId and role from auth_db.users based on client schema
    const adminRows = await db.authQuery(
        `SELECT u.id, r.code as role_code 
         FROM auth_db.users u 
         LEFT JOIN auth_db.roles r ON u.role_id = r.id 
         WHERE u.client = ? LIMIT 1`,
        [clientSchema]
    );

    if (adminRows.length === 0) return null;

    const organizationId = adminRows[0].id;
    const roleCode = adminRows[0].role_code;
    const creditsTable = 'credits'; // Both ATS and College use 'credits' table

    // 2. Get active subscription from DB
    const subRows = await db.query(
        `SELECT *, HEX(id) as id, HEX(payment_id) as payment_id FROM subscriptions 
         WHERE organization_id = ? AND status = 'ACTIVE' 
         ORDER BY created_at DESC LIMIT 1`,
        [organizationId]
    );

    if (subRows.length > 0) {
        return mapToSubscriptionResponse(subRows[0]);
    }

    // 3. Fallback: If no formal subscription record exists but credits DO, 
    // create and save a default one so it has a real UUID and persists.
    const newSubscriptionId = uuidv4();
    const [clientCredits] = await db.clientQuery(
        clientSchema,
        `SELECT created_at, valid_till, total_interview_credits, total_position_credits, is_active FROM ${creditsTable} WHERE is_active = 1 LIMIT 1`,
        []
    );

    if (!clientCredits) return null;

    const validFrom = clientCredits.created_at;
    const validUntil = clientCredits.valid_till;
    const dynamicBillingCycle = getBillingCycle(validFrom, validUntil);

    await db.query(
        `INSERT INTO subscriptions (
            id, organization_id, subscribed_products, billing_cycle,
            total_interview_credits, interview_credits_price, demo_interview_credits,
            total_position_credits, position_credits_price, tax_rate, tax_inclusive,
            sub_total, total_amount, grand_total_amount, valid_from, valid_until,
            status, is_subscription
        ) VALUES (UNHEX(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            newSubscriptionId.replace(/-/g, ''), organizationId, 'BOTH', dynamicBillingCycle,
            clientCredits.total_interview_credits || 0, 0, 0,
            clientCredits.total_position_credits || 0, 0, 18.00, 0,
            0, 0, 0, validFrom, validUntil,
            clientCredits.is_active ? 'ACTIVE' : 'INACTIVE', 1
        ]
    );

    const createdSubRows = await db.query("SELECT *, HEX(id) as id, HEX(payment_id) as payment_id FROM subscriptions WHERE id = UNHEX(?)", [newSubscriptionId.replace(/-/g, '')]);
    return mapToSubscriptionResponse(createdSubRows[0]);
};

/**
 * Get ALL subscriptions for an admin (all statuses, newest first)
 */
const getSubscriptionsByAdmin = async (adminId) => {
    const rows = await db.query(
        `SELECT *, HEX(id) as id, HEX(payment_id) as payment_id
         FROM subscriptions
         WHERE organization_id = ?
         ORDER BY created_at DESC`,
        [adminId]
    );
    return rows.map(mapToSubscriptionResponse);
};

/**
 * Confirm payment and activate credits
 */
const confirmPayment = async (paymentId, transactionData = {}) => {
    // Update payment status to COMPLETED
    const payment = await paymentService.updatePaymentStatus(paymentId, 'COMPLETED', transactionData);

    // If payment is completed and has credits, update the credits in the client DB
    if (payment.interviewCreditsAdded > 0 || payment.positionCreditsAdded > 0) {
        // Find the client schema associated with this payment
        const rawPaymentRows = await db.query(
            `SELECT client_schema FROM payments WHERE id = UNHEX(?)`,
            [payment.id.replace(/-/g, '')]
        );
        const clientSchema = rawPaymentRows[0]?.client_schema;

        if (clientSchema) {
            // Get role to determine credits table
            const adminRows = await db.authQuery(
                `SELECT r.code as role_code 
                 FROM auth_db.users u 
                 LEFT JOIN auth_db.roles r ON u.role_id = r.id 
                 WHERE u.client = ? LIMIT 1`,
                [clientSchema]
            );
            const roleCode = adminRows[0]?.role_code || 'ADMIN';
            const creditsTable = 'credits'; // Both ATS and College use 'credits' table
            
            const config = require('../config');
            const mysql = require('mysql2/promise');

            const clientPool = mysql.createPool({
                host: config.database.host,
                port: config.database.port,
                user: config.database.user,
                password: config.database.password,
                database: clientSchema,
                waitForConnections: true,
                connectionLimit: 1
            });

            try {
                const conn = await clientPool.getConnection();

                // Update credits in client DB
                await conn.execute(
                    `UPDATE ${creditsTable}
                    SET total_interview_credits = total_interview_credits + ?,
                        total_position_credits = total_position_credits + ?,
                        valid_till = DATE_ADD(COALESCE(valid_till, CURDATE()), INTERVAL ? DAY),
                        updated_at = NOW()
                    WHERE is_active = 1`,
                    [
                        payment.interviewCreditsAdded || 0,
                        payment.positionCreditsAdded || 0,
                        payment.validityExtendedDays || 0
                    ]
                );

                conn.release();
            } finally {
                await clientPool.end();
            }

            // Syncing with superadmin_db is no longer needed as per user requirement
            // No syncAllCredits call here

            // Record history
            const credits = await db.clientQuery(clientSchema, `SELECT * FROM ${creditsTable} WHERE is_active = 1 LIMIT 1`, []);
            if (credits && credits.length > 0) {
                const historyId = uuidv4();
                const historyIdBuffer = Buffer.from(historyId.replace(/-/g, ''), 'hex');
                await db.query(
                    `INSERT INTO credits_history (
                        id, client_schema, admin_user_id, change_type,
                        interview_credits_change, position_credits_change, screening_credits_change,
                        interview_credits_before, interview_credits_after,
                        position_credits_before, position_credits_after,
                        screening_credits_before, screening_credits_after,
                        reference_type, reference_id, notes, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [
                        historyIdBuffer, clientSchema, payment.organizationId, 'PURCHASE',
                        payment.interviewCreditsAdded || 0, payment.positionCreditsAdded || 0, payment.screeningCreditsAdded || 0,
                        (credits[0].total_interview_credits - (payment.interviewCreditsAdded || 0)), credits[0].total_interview_credits,
                        (credits[0].total_position_credits - (payment.positionCreditsAdded || 0)), credits[0].total_position_credits,
                        (credits[0].total_screening_credits - (payment.screeningCreditsAdded || 0)), credits[0].total_screening_credits,
                        'PAYMENT', payment.id,
                        `Credits activated via payment confirmation. Invoice: ${payment.invoiceNumber}`
                    ]
                ).catch(err => console.error('Failed to record history in confirmPayment:', err.message));
            }
        }
    }

    return payment;
};

/**
 * Update an existing subscription
 */
const updateSubscription = async (subscriptionId, updateData) => {
    const idBuffer = Buffer.from(subscriptionId.replace(/-/g, ''), 'hex');
    const updates = [];
    const params = [];

    if (updateData.isSubscription !== undefined) {
        updates.push('is_subscription = ?');
        params.push(updateData.isSubscription ? 1 : 0);
    }

    if (updateData.paymentId !== undefined) {
        updates.push('payment_id = ?');
        params.push(updateData.paymentId ? Buffer.from(updateData.paymentId.replace(/-/g, ''), 'hex') : null);
    }

    if (updateData.status) {
        updates.push('status = ?');
        params.push(updateData.status);
    }

    if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        params.push(idBuffer);
        await db.query(
            `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = ?`,
            params
        );

        // Sync with auth_db if subscription is activated
        if (updateData.isSubscription === true) {
            const subRows = await db.query("SELECT organization_id FROM subscriptions WHERE id = ?", [idBuffer]);
            if (subRows.length > 0) {
                await db.authQuery(
                    `UPDATE auth_db.users SET is_subscribed = 1 WHERE id = ?`,
                    [subRows[0].organization_id]
                ).catch(err => console.error('Failed to update subscription status in auth_db during update:', err.message));
            }
        }
    }

    const subRows = await db.query("SELECT *, HEX(id) as id, HEX(payment_id) as payment_id FROM subscriptions WHERE id = ?", [idBuffer]);
    return mapToSubscriptionResponse(subRows[0]);
};

module.exports = {
    createSubscription,
    purchaseCredits,
    getSubscriptionByClient,
    getSubscriptionsByAdmin,
    confirmPayment,
    updateSubscription
};
