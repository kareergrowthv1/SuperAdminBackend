const subscriptionService = require('../services/subscriptionService');
const { calculateCreditAmount } = require('../config/pricing');

/**
 * Create a new subscription with credits
 */
exports.createSubscription = async (req, res, next) => {
    try {
        const subscriptionData = req.body;

        // Validate required fields
        if (!subscriptionData.clientSchema || !subscriptionData.adminUserId || !subscriptionData.adminEmail) {
            const error = new Error('clientSchema, adminUserId, and adminEmail are required');
            error.status = 400;
            throw error;
        }

        const subscription = await subscriptionService.createSubscription(subscriptionData);

        return res.status(201).json({
            success: true,
            message: 'Subscription created successfully. Complete payment to activate credits.',
            data: subscription
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Purchase additional credits
 */
exports.purchaseCredits = async (req, res, next) => {
    try {
        const purchaseData = req.body;

        // Validate required fields
        if (!purchaseData.clientSchema || !purchaseData.adminUserId || !purchaseData.adminEmail) {
            const error = new Error('clientSchema, adminUserId, and adminEmail are required');
            error.status = 400;
            throw error;
        }

        const purchase = await subscriptionService.purchaseCredits(purchaseData);

        return res.status(201).json({
            success: true,
            message: 'Credit purchase initiated. Complete payment to activate credits.',
            data: purchase
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get subscription details by client
 */
exports.getSubscriptionByClient = async (req, res, next) => {
    try {
        const { clientSchema } = req.params;

        const subscriptionData = await subscriptionService.getSubscriptionByClient(clientSchema);

        return res.status(200).json({
            success: true,
            message: 'Subscription details retrieved successfully',
            data: subscriptionData
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Confirm payment and activate credits
 */
exports.confirmPayment = async (req, res, next) => {
    try {
        const { paymentId } = req.params;
        const transactionData = req.body;

        const payment = await subscriptionService.confirmPayment(paymentId, transactionData);

        return res.status(200).json({
            success: true,
            message: 'Payment confirmed and credits activated successfully',
            data: payment
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Calculate credit pricing
 */
exports.calculatePricing = async (req, res, next) => {
    try {
        const {
            interviewCredits = 0,
            positionCredits = 0,
            taxRate = 18,
            taxInclusive = false
        } = req.query;

        const pricing = calculateCreditAmount(
            parseInt(interviewCredits),
            parseInt(positionCredits),
            parseFloat(taxRate),
            taxInclusive === 'true'
        );

        return res.status(200).json({
            success: true,
            message: 'Pricing calculated successfully',
            data: pricing
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update a subscription
 */
exports.updateSubscription = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const subscription = await subscriptionService.updateSubscription(id, updateData);

        return res.status(200).json({
            success: true,
            message: 'Subscription updated successfully',
            data: subscription
        });
    } catch (error) {
        next(error);
    }
};
