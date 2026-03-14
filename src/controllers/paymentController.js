const paymentService = require('../services/paymentService');

/**
 * Create a new payment
 */
exports.createPayment = async (req, res, next) => {
    try {
        const paymentData = req.body;

        const payment = await paymentService.createPayment(paymentData);

        return res.status(201).json({
            success: true,
            message: 'Payment created successfully',
            data: payment
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get payment by ID
 */
exports.getPaymentById = async (req, res, next) => {
    try {
        const { paymentId } = req.params;

        const payment = await paymentService.getPaymentById(paymentId);

        return res.status(200).json({
            success: true,
            message: 'Payment retrieved successfully',
            data: payment
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get payments by admin user ID
 */
exports.getPaymentsByAdmin = async (req, res, next) => {
    try {
        const { adminUserId } = req.params;

        const payments = await paymentService.getPaymentsByAdmin(adminUserId);

        return res.status(200).json({
            success: true,
            message: 'Payments retrieved successfully',
            data: {
                payments,
                count: payments.length
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get payments by client schema
 */
exports.getPaymentsByClient = async (req, res, next) => {
    try {
        const { clientSchema } = req.params;

        const payments = await paymentService.getPaymentsByClient(clientSchema);

        return res.status(200).json({
            success: true,
            message: 'Payments retrieved successfully',
            data: {
                payments,
                count: payments.length
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all payments with pagination and filters
 */
exports.getAllPayments = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, clientSchema, paymentStatus, paymentType } = req.query;

        const filters = {};
        if (clientSchema) filters.clientSchema = clientSchema;
        if (paymentStatus) filters.paymentStatus = paymentStatus;
        if (paymentType) filters.paymentType = paymentType;

        const result = await paymentService.getAllPayments(
            parseInt(page),
            parseInt(limit),
            filters
        );

        return res.status(200).json({
            success: true,
            message: 'Payments retrieved successfully',
            data: result.data,
            pagination: result.pagination
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update payment status
 */
exports.updatePaymentStatus = async (req, res, next) => {
    try {
        const { paymentId } = req.params;
        const { status, transactionId, gatewayResponse } = req.body;

        if (!status) {
            const error = new Error('Payment status is required');
            error.status = 400;
            throw error;
        }

        const validStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'];
        if (!validStatuses.includes(status)) {
            const error = new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
            error.status = 400;
            throw error;
        }

        const payment = await paymentService.updatePaymentStatus(paymentId, status, {
            transactionId,
            gatewayResponse
        });

        return res.status(200).json({
            success: true,
            message: 'Payment status updated successfully',
            data: payment
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get payment statistics
 */
exports.getPaymentStats = async (req, res, next) => {
    try {
        const { clientSchema } = req.query;

        // Get payment stats from database
        const conditions = clientSchema ? 'WHERE client_schema = ?' : '';
        const params = clientSchema ? [clientSchema] : [];

        const db = require('../config/db');

        const [totalStats, statusStats] = await Promise.all([
            db.query(
                `SELECT 
                    COUNT(*) as totalPayments,
                    COALESCE(SUM(amount), 0) as totalRevenue,
                    COALESCE(SUM(interview_credits_added), 0) as totalInterviewCredits,
                    COALESCE(SUM(position_credits_added), 0) as totalPositionCredits
                FROM payments ${conditions}`,
                params
            ),
            db.query(
                `SELECT 
                    payment_status,
                    COUNT(*) as count,
                    COALESCE(SUM(amount), 0) as totalAmount
                FROM payments ${conditions}
                GROUP BY payment_status`,
                params
            )
        ]);

        return res.status(200).json({
            success: true,
            message: 'Payment statistics retrieved successfully',
            data: {
                totals: totalStats[0] || {
                    totalPayments: 0,
                    totalRevenue: 0,
                    totalInterviewCredits: 0,
                    totalPositionCredits: 0
                },
                byStatus: statusStats || []
            }
        });
    } catch (error) {
        next(error);
    }
};
