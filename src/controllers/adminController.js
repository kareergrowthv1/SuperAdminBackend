const adminService = require('../services/adminService');
const subscriptionService = require('../services/subscriptionService');

exports.createAdmin = async (req, res, next) => {
    try {
        const result = await adminService.createAdminViaBackend(req.body);

        return res.status(201).json({
            success: true,
            message: 'Admin user created successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.getAdmins = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '20', 10);
        const search = (req.query.search || '').trim();
        const type = (req.query.type || '').trim();
        const ats = (req.query.ats || '').trim();
        const createdFrom = req.query.createdFrom || '';
        const createdTo = req.query.createdTo || '';
        const sortOrder = req.query.sortOrder || 'NEWEST_TO_OLDEST';

        let status = [];
        if (req.query.status) {
            status = Array.isArray(req.query.status) ? req.query.status : req.query.status.split(',');
        }

        const result = await adminService.getAdmins({
            page,
            limit,
            search,
            status,
            type,
            ats,
            createdFrom,
            createdTo,
            sortOrder
        });

        return res.status(200).json({
            success: true,
            message: 'Admins fetched successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.updateAdminStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (typeof is_active !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'is_active must be a boolean value'
            });
        }

        const result = await adminService.updateAdminStatus(id, is_active);

        return res.status(200).json({
            success: true,
            message: `Admin ${is_active ? 'activated' : 'deactivated'} successfully`,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.addCredits = async (req, res, next) => {
    try {
        const {
            adminId,
            totalInterviewCredits,
            totalPositionCredits,
            totalScreeningCredits,
            screeningCreditsMin,
            screeningCreditsCostPerPrice,
            validTill,
            paymentDetails: nestedPaymentDetails, // Nested structure from user example
            paymentMethod, // Flat fallback
            paymentId,
            receivedBy,
            paymentDate,
            discountCoupon,
            isManual,
            totalAmount,
            billingCycle
        } = req.body;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                message: 'Admin ID is required'
            });
        }

        // Use nested if provided, otherwise construct from flat fields
        const finalPaymentDetails = nestedPaymentDetails || {
            paymentMethod,
            paymentId,
            receivedBy,
            paymentDate,
            discountCoupon,
            isManual,
            totalAmount,
            billingCycle
        };

        const result = await adminService.addCredits(
            adminId,
            totalInterviewCredits || 0,
            totalPositionCredits || 0,
            totalScreeningCredits || 0,
            screeningCreditsMin,
            screeningCreditsCostPerPrice,
            validTill,
            finalPaymentDetails
        );

        return res.status(200).json({
            success: true,
            message: 'Credits added successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.getAdminCredits = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await adminService.getAdminCredits(id);
        return res.status(200).json({
            success: true,
            message: 'Credits fetched successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.getAdminDetails = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await adminService.getAdminDetails(id);
        return res.status(200).json({
            success: true,
            message: 'Admin details fetched successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.getAdminStats = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await adminService.getAdminStats(id);
        return res.status(200).json({
            success: true,
            message: 'Admin stats fetched successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.getAdminPayments = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await adminService.getAdminPayments(id);
        return res.status(200).json({
            success: true,
            message: 'Admin payments fetched successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.getAdminCreditHistory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await adminService.getAdminCreditHistory(id);
        return res.status(200).json({
            success: true,
            message: 'Credit history fetched successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.getAdminSubscription = async (req, res, next) => {
    try {
        const { id } = req.params;
        const subscriptions = await subscriptionService.getSubscriptionsByAdmin(id);
        return res.status(200).json({
            success: true,
            message: 'Admin subscriptions fetched successfully',
            data: subscriptions
        });
    } catch (error) {
        next(error);
    }
};

exports.updateAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        const result = await adminService.updateAdmin(id, updateData);
        return res.status(200).json({
            success: true,
            message: 'Admin updated successfully',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.getRoles = async (req, res, next) => {
    try {
        const roles = await adminService.getSystemRoles();
        return res.status(200).json({
            success: true,
            message: 'Roles fetched successfully',
            data: roles
        });
    } catch (error) {
        next(error);
    }
};
