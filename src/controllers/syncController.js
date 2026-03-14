const syncService = require('../services/syncService');

exports.syncCredits = async (req, res, next) => {
    try {
        const result = await syncService.syncAllCredits();
        return res.status(200).json({
            success: result.success,
            message: result.success ? 'Credits sync completed successfully' : 'Credits sync failed',
            data: result
        });
    } catch (error) {
        return next(error);
    }
};
