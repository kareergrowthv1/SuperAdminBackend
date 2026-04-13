const jobService = require('../services/jobService');

const getJobs = async (req, res, next) => {
    try {
        const { page, limit, search, createdFrom, createdTo, sortOrder } = req.query;
        let { status, locations } = req.query;

        if (status && !Array.isArray(status)) {
            status = status.split(',');
        }

        if (locations && !Array.isArray(locations)) {
            locations = locations.split(',');
        }

        const result = await jobService.getJobs({
            page,
            limit,
            search,
            status,
            locations,
            createdFrom,
            createdTo,
            sortOrder
        });

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

const updateJobStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const result = await jobService.updateJobStatus(id, status);

        res.status(200).json({
            success: true,
            message: `Job status updated to ${status}`,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

const getLocations = async (req, res, next) => {
    try {
        const { search } = req.query;
        const result = await jobService.getUniqueLocations(search);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

const getJobById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await jobService.getJobById(id);
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

const createJob = async (req, res, next) => {
    try {
        const result = await jobService.createJob(req.body);
        res.status(201).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

const updateJob = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await jobService.updateJob(id, req.body);
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getJobs,
    getJobById,
    createJob,
    updateJob,
    updateJobStatus,
    getLocations
};
