const db = require('../config/db');

/**
 * Get paginated and filtered jobs from the superadmin_db
 */
const getJobs = async ({ page = 1, limit = 20, search = '', status = [], locations = [], createdFrom = '', createdTo = '', sortOrder = 'NEWEST_TO_OLDEST' } = {}) => {
    // Ensure page and limit are proper numbers
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;

    const countParams = [];
    const selectParams = [];

    let whereClause = 'WHERE is_active = 1';

    if (status && status.length > 0) {
        const statuses = Array.isArray(status) ? status : [status];
        const placeholders = statuses.map(() => '?').join(',');
        whereClause += ` AND status IN (${placeholders})`;
        statuses.forEach(s => {
            countParams.push(s.toUpperCase());
            selectParams.push(s.toUpperCase());
        });
    }

    if (locations && locations.length > 0) {
        const locs = Array.isArray(locations) ? locations : [locations];
        const placeholders = locs.map(() => '?').join(',');
        whereClause += ` AND location IN (${placeholders})`;
        locs.forEach(l => {
            countParams.push(l);
            selectParams.push(l);
        });
    }

    if (createdFrom) {
        whereClause += ' AND created_at >= ?';
        countParams.push(createdFrom);
        selectParams.push(createdFrom);
    }

    if (createdTo) {
        whereClause += ' AND created_at <= ?';
        countParams.push(createdTo + ' 23:59:59');
        selectParams.push(createdTo + ' 23:59:59');
    }

    if (search) {
        const like = `%${search}%`;
        whereClause += ' AND (title LIKE ? OR client_name LIKE ? OR admin_email LIKE ? OR location LIKE ?)';
        countParams.push(like, like, like, like);
        selectParams.push(like, like, like, like);
    }

    const countRows = await db.query(
        `SELECT COUNT(*) AS total FROM jobs ${whereClause}`,
        countParams
    );

    let orderBySql = 'created_at DESC';
    if (sortOrder === 'OLDEST_TO_NEWEST') orderBySql = 'created_at ASC';
    if (sortOrder === 'TITLE_ASC') orderBySql = 'title ASC';
    if (sortOrder === 'TITLE_DESC') orderBySql = 'title DESC';

    const selectQuery = `
        SELECT 
            BIN_TO_UUID(id) as id, 
            client_schema, 
            client_name, 
            admin_user_id, 
            admin_email, 
            title, 
            position_type, 
            location, 
            applications_count, 
            status, 
            created_at 
        FROM jobs 
        ${whereClause} 
        ORDER BY ${orderBySql} 
        LIMIT ${safeLimit} OFFSET ${offset}
    `;

    const rows = await db.query(selectQuery, selectParams);

    return {
        items: rows,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total: countRows[0]?.total || 0,
            totalPages: Math.ceil((countRows[0]?.total || 0) / safeLimit)
        }
    };
};

/**
 * Toggle job status (OPEN/CLOSED)
 */
const updateJobStatus = async (jobId, status) => {
    if (!jobId) throw new Error('Job ID is required');
    if (!['OPEN', 'CLOSED', 'ARCHIVED'].includes(status.toUpperCase())) {
        throw new Error('Invalid status');
    }

    await db.query(
        'UPDATE jobs SET status = ?, updated_at = NOW() WHERE id = UUID_TO_BINARY(?)',
        [status.toUpperCase(), jobId]
    );

    const updatedJob = await db.query(
        'SELECT BIN_TO_UUID(id) as id, status FROM jobs WHERE id = UUID_TO_BINARY(?)',
        [jobId]
    );

    if (updatedJob.length === 0) throw new Error('Job not found');
    return updatedJob[0];
};

/**
 * Get unique locations matching search string
 */
const getUniqueLocations = async (search = '') => {
    let query = 'SELECT DISTINCT location FROM jobs WHERE is_active = 1';
    const params = [];

    if (search && search.length >= 3) {
        query += ' AND location LIKE ?';
        params.push(`%${search}%`);
    } else if (search && search.length > 0) {
        // Don't search if less than 3 chars unless strictly required by frontend logic
        // but let's allow it if search is provided
        query += ' AND location LIKE ?';
        params.push(`%${search}%`);
    }

    query += ' ORDER BY location ASC LIMIT 20';

    const rows = await db.query(query, params);
    return rows.map(row => row.location).filter(Boolean);
};

module.exports = {
    getJobs,
    updateJobStatus,
    getUniqueLocations
};
