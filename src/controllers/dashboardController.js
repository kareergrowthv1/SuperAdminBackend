const dashboardService = require('../services/dashboardService');

exports.getSummary = async (req, res, next) => {
    try {
        const summary = await dashboardService.getDashboardSummary();
        return res.status(200).json({
            success: true,
            message: 'Dashboard summary fetched successfully',
            data: summary
        });
    } catch (error) {
        return next(error);
    }
};

exports.getCredits = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search = '', syncFrom = '', syncTo = '', sortOrder = 'NAME_ASC' } = req.query;
        let { status } = req.query;

        if (status && !Array.isArray(status)) {
            status = status.split(',');
        }

        const credits = await dashboardService.getCreditsOverview({
            page,
            limit,
            search,
            status,
            syncFrom,
            syncTo,
            sortOrder
        });
        return res.status(200).json({
            success: true,
            message: 'Credits overview fetched successfully',
            data: credits
        });
    } catch (error) {
        return next(error);
    }
};

exports.getActivity = async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit || '8', 10);
        const activity = await dashboardService.getActivityFeed(limit);
        return res.status(200).json({
            success: true,
            message: 'Recent activity fetched successfully',
            data: {
                items: activity
            }
        });
    } catch (error) {
        return next(error);
    }
};

exports.getHealth = async (req, res, next) => {
    try {
        const health = await dashboardService.getServiceHealth();
        return res.status(200).json({
            success: true,
            message: 'Service health fetched successfully',
            data: health
        });
    } catch (error) {
        return next(error);
    }
};

exports.getTrends = async (req, res, next) => {
    try {
        const { period, year, month, adminId } = req.query;
        const trends = await dashboardService.getTrends({
            period,
            year: year ? parseInt(year, 10) : undefined,
            month,
            adminId: adminId ? parseInt(adminId, 10) : undefined
        });
        return res.status(200).json({
            success: true,
            message: 'Trends data fetched successfully',
            data: trends
        });
    } catch (error) {
        return next(error);
    }
};

exports.getAdmins = async (req, res, next) => {
    try {
        const { search = '', limit = 15, page = 1 } = req.query;
        const admins = await dashboardService.getAdminList({
            search,
            limit: parseInt(limit, 10),
            page: parseInt(page, 10)
        });
        return res.status(200).json({
            success: true,
            message: 'Admin list fetched successfully',
            data: admins
        });
    } catch (error) {
        return next(error);
    }
};
