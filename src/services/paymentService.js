const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { calculateCreditAmount } = require('../config/pricing');

/**
 * Helper to map DB row to Java DTO style (CamelCase)
 */
const mapToPaymentResponse = (payment) => {
    if (!payment) return null;

    let id = payment.id;
    if (id && typeof id === 'string' && id.length === 32) {
        id = id.toLowerCase().replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    }

    let subscriptionId = payment.subscription_id;
    if (subscriptionId && typeof subscriptionId === 'string' && subscriptionId.length === 32) {
        subscriptionId = subscriptionId.toLowerCase().replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    }

    return {
        id,
        organizationId: payment.admin_user_id,
        subscriptionId: subscriptionId || null,
        invoiceNumber: payment.invoice_number || null,
        amount: parseFloat(payment.amount),
        currency: payment.currency,
        paymentStatus: payment.payment_status,
        paymentMethod: payment.payment_method,
        paymentType: payment.payment_type,
        interviewCreditsAdded: payment.interview_credits_added,
        positionCreditsAdded: payment.position_credits_added,
        screeningCreditsAdded: payment.screening_credits_added,
        transactionId: payment.transaction_id,
        receivedBy: payment.received_by,
        paymentDate: payment.payment_date,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at
    };
};

/**
 * Create a payment record
 */
const createPayment = async (paymentData) => {
    const {
        clientSchema,
        adminUserId,
        adminEmail,
        subscriptionId = null,       // ← link to subscription
        paymentType,
        amount,
        currency = 'INR',
        interviewCreditsAdded = 0,
        positionCreditsAdded = 0,
        screeningCreditsAdded = 0,
        paymentMethod = null,
        paymentStatus = 'PENDING',
        transactionId = null,
        receivedBy = null,
        paymentNotes = null,
        gatewayResponse = null,
        paymentDate = null
    } = paymentData;

    const paymentId = uuidv4();
    const idBuffer = Buffer.from(paymentId.replace(/-/g, ''), 'hex');

    // Generate sequential 6-digit Invoice Number (INVXXXXXX)
    const countResult = await db.query('SELECT COUNT(*) as count FROM payments');
    const paymentCount = (countResult[0]?.count || 0) + 1;
    const autoInvoiceNumber = `INV${String(paymentCount).padStart(6, '0')}`;

    // Convert subscriptionId to binary(16) if provided
    const subIdBuffer = subscriptionId
        ? Buffer.from(subscriptionId.replace(/-/g, ''), 'hex')
        : null;

    await db.query(
        `INSERT INTO payments (
            id, subscription_id, client_schema, admin_user_id, admin_email,
            payment_type, amount, currency,
            interview_credits_added, position_credits_added, screening_credits_added,
            payment_status, payment_method, transaction_id,
            invoice_number, received_by, payment_notes,
            gateway_response, payment_date,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
            idBuffer, subIdBuffer, clientSchema, adminUserId, adminEmail,
            paymentType, amount, currency,
            interviewCreditsAdded, positionCreditsAdded, screeningCreditsAdded,
            paymentStatus, paymentMethod, transactionId,
            autoInvoiceNumber, receivedBy, paymentNotes,
            gatewayResponse ? JSON.stringify(gatewayResponse) : null,
            paymentDate || (paymentStatus === 'COMPLETED' ? new Date() : null)
        ]
    );

    return getPaymentById(paymentId);
};

/**
 * Get payment by ID
 */
const getPaymentById = async (paymentId) => {
    const idBuffer = Buffer.from(paymentId.replace(/-/g, ''), 'hex');

    const payments = await db.query(
        `SELECT 
            HEX(id) as id,
            HEX(subscription_id) as subscription_id,
            client_schema, admin_user_id,
            payment_type, amount, currency,
            interview_credits_added, position_credits_added, screening_credits_added,
            payment_status, payment_method, transaction_id,
            invoice_number, received_by, payment_notes,
            gateway_response, payment_date,
            created_at, updated_at
        FROM payments
        WHERE id = ?`,
        [idBuffer]
    );

    if (payments.length === 0) {
        const error = new Error('Payment not found');
        error.status = 404;
        throw error;
    }

    return mapToPaymentResponse(payments[0]);
};

/**
 * Get payments by admin user
 */
const getPaymentsByAdmin = async (adminUserId) => {
    const payments = await db.query(
        `SELECT 
            HEX(id) as id,
            HEX(subscription_id) as subscription_id,
            client_schema, admin_user_id, admin_email,
            payment_type, amount, currency,
            interview_credits_added, position_credits_added, screening_credits_added,
            payment_status, payment_method, transaction_id, invoice_number, payment_date, created_at
        FROM payments
        WHERE admin_user_id = ?
        ORDER BY created_at DESC`,
        [adminUserId]
    );

    return payments.map(mapToPaymentResponse);
};

/**
 * Get payments by client schema
 */
const getPaymentsByClient = async (clientSchema) => {
    const payments = await db.query(
        `SELECT 
            HEX(id) as id,
            HEX(subscription_id) as subscription_id,
            client_schema, admin_user_id, admin_email,
            payment_type, amount, currency,
            interview_credits_added, position_credits_added, screening_credits_added,
            payment_status, payment_method, transaction_id, invoice_number, payment_date, created_at
        FROM payments
        WHERE client_schema = ?
        ORDER BY created_at DESC`,
        [clientSchema]
    );

    return payments.map(mapToPaymentResponse);
};

/**
 * Update payment status
 */
const updatePaymentStatus = async (paymentId, status, additionalData = {}) => {
    const idBuffer = Buffer.from(paymentId.replace(/-/g, ''), 'hex');

    const updates = ['payment_status = ?', 'updated_at = NOW()'];
    const params = [status];

    if (additionalData.transactionId) {
        updates.push('transaction_id = ?');
        params.push(additionalData.transactionId);
    }

    if (additionalData.gatewayResponse) {
        updates.push('gateway_response = ?');
        params.push(JSON.stringify(additionalData.gatewayResponse));
    }

    if (status === 'COMPLETED') {
        updates.push('payment_date = NOW()');
    }

    params.push(idBuffer);

    await db.query(
        `UPDATE payments SET ${updates.join(', ')} WHERE id = ?`,
        params
    );

    return getPaymentById(paymentId);
};

/**
 * Get all payments with pagination
 */
const getAllPayments = async (page = 1, limit = 10, filters = {}) => {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (filters.clientSchema) {
        conditions.push('client_schema = ?');
        params.push(filters.clientSchema);
    }

    if (filters.paymentStatus) {
        conditions.push('payment_status = ?');
        params.push(filters.paymentStatus);
    }

    if (filters.paymentType) {
        conditions.push('payment_type = ?');
        params.push(filters.paymentType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await db.query(
        `SELECT COUNT(*) as total FROM payments ${whereClause}`,
        params
    );

    const total = countResult[0]?.total || 0;

    // Get paginated data
    const payments = await db.query(
        `SELECT 
            HEX(id) as id,
            client_schema, admin_user_id, admin_email,
            payment_type, amount, currency,
            interview_credits_added, position_credits_added, screening_credits_added,
            payment_status, payment_method, payment_date, created_at
        FROM payments
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    return {
        data: payments.map(mapToPaymentResponse),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

module.exports = {
    createPayment,
    getPaymentById,
    getPaymentsByAdmin,
    getPaymentsByClient,
    updatePaymentStatus,
    getAllPayments
};
