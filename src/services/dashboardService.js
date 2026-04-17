const axios = require('axios');
const config = require('../config');
const db = require('../config/db');

const mapCreditsRow = (row) => {
    if (!row) {
        return {
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
            lastSyncedAt: null
        };
    }

    const totalInterview = Number(row.total_interview_credits || 0);
    const utilizedInterview = Number(row.utilized_interview_credits || 0);
    const totalPosition = Number(row.total_position_credits || 0);
    const utilizedPosition = Number(row.utilized_position_credits || 0);
    const totalScreening = Number(row.total_screening_credits || 0);
    const utilizedScreening = Number(row.utilized_screening_credits || 0);

    return {
        totalInterviewCredits: totalInterview,
        utilizedInterviewCredits: utilizedInterview,
        remainingInterviewCredits: Math.max(0, totalInterview - utilizedInterview),
        totalPositionCredits: totalPosition,
        utilizedPositionCredits: utilizedPosition,
        remainingPositionCredits: Math.max(0, totalPosition - utilizedPosition),
        totalScreeningCredits: totalScreening,
        utilizedScreeningCredits: utilizedScreening,
        remainingScreeningCredits: Math.max(0, totalScreening - utilizedScreening),
        validTill: row.valid_till ? new Date(row.valid_till).toISOString().slice(0, 10) : null,
        isActive: !!row.is_active,
        lastSyncedAt: row.updated_at || row.created_at || null
    };
};

const fetchCreditsForSchema = async (schemaName, roleCode = null) => {
    if (!schemaName) return null;
    
    try {
        // Both ATS and College use 'credits' table in tenant DBs
        const creditsTable = 'credits';
        const isAtsRole = roleCode === 'ATS';
        
        const rows = await db.clientQuery(
            schemaName,
            `SELECT total_interview_credits,
                    utilized_interview_credits,
                    total_position_credits,
                    utilized_position_credits,
                    ${isAtsRole ? 'total_screening_credits,' : '0 as total_screening_credits,'}
                    ${isAtsRole ? 'utilized_screening_credits,' : '0 as utilized_screening_credits,'}
                    valid_till,
                    is_active,
                    created_at,
                    updated_at
             FROM ${creditsTable}
             WHERE is_active = 1
             ORDER BY created_at DESC
             LIMIT 1`,
            []
        );

        return mapCreditsRow(rows[0]);
    } catch (error) {
        console.warn(`[DashboardService] Failed to fetch credits for ${schemaName}:`, error.message);
        return null;
    }
};

const getDashboardSummary = async () => {
    // Query auth_db for admin data and superadmin_db for payment data
    const [
        totalAdmins,
        activeAdmins,
        inactiveAdmins,
        collegeAdmins,
        recruiterAdmins,
        totalPayments,
        completedPayments,
        completedCollegePayments,
        completedRecruiterPayments,
        newAdmins30d
    ] = await Promise.all([
        // Total admins (both active and inactive)
        db.authQuery('SELECT COUNT(*) AS total FROM auth_db.users WHERE is_admin = 1 AND client IS NOT NULL'),

        // Active admins
        db.authQuery('SELECT COUNT(*) AS total FROM auth_db.users WHERE is_admin = 1 AND client IS NOT NULL AND is_active = 1'),

        // Inactive admins
        db.authQuery('SELECT COUNT(*) AS total FROM auth_db.users WHERE is_admin = 1 AND client IS NOT NULL AND is_active = 0'),

        // College admins (ADMIN role)
        db.authQuery(`SELECT COUNT(*) AS total FROM auth_db.users u 
                      LEFT JOIN auth_db.roles r ON u.role_id = r.id 
                      WHERE u.is_admin = 1 AND u.client IS NOT NULL AND r.code = 'ADMIN'`),

        // Recruiter admins (ATS role)
        db.authQuery(`SELECT COUNT(*) AS total FROM auth_db.users u 
                      LEFT JOIN auth_db.roles r ON u.role_id = r.id 
                      WHERE u.is_admin = 1 AND u.client IS NOT NULL AND r.code = 'ATS'`),

        // Total payment count from superadmin_db
        db.query('SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS total_amount FROM payments'),

        // Completed payments
        db.query('SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS total_amount FROM payments WHERE payment_status = "COMPLETED"'),

        // Completed payments - college admins
        db.query(
            `SELECT COUNT(*) AS total, COALESCE(SUM(p.amount), 0) AS total_amount
             FROM payments p
             LEFT JOIN auth_db.users u ON u.id = p.admin_user_id
             LEFT JOIN auth_db.roles r ON u.role_id = r.id
             WHERE p.payment_status = "COMPLETED" AND r.code = 'ADMIN'`
        ),

        // Completed payments - recruiter admins
        db.query(
            `SELECT COUNT(*) AS total, COALESCE(SUM(p.amount), 0) AS total_amount
             FROM payments p
             LEFT JOIN auth_db.users u ON u.id = p.admin_user_id
             LEFT JOIN auth_db.roles r ON u.role_id = r.id
             WHERE p.payment_status = "COMPLETED" AND r.code = 'ATS'`
        ),

        // New admins in last 30 days
        db.authQuery(
            `SELECT COUNT(*) AS total
             FROM auth_db.users
             WHERE is_admin = 1
               AND client IS NOT NULL
               AND created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)`
        )
    ]);

    return {
        totals: {
            totalAdmins: totalAdmins[0]?.total || 0,
            activeAdmins: activeAdmins[0]?.total || 0,
            inactiveAdmins: inactiveAdmins[0]?.total || 0,
            collegeAdmins: collegeAdmins[0]?.total || 0,
            recruiterAdmins: recruiterAdmins[0]?.total || 0
        },
        payments: {
            totalCount: totalPayments[0]?.total || 0,
            totalAmount: parseFloat(totalPayments[0]?.total_amount || 0),
            completedCount: completedPayments[0]?.total || 0,
            completedAmount: parseFloat(completedPayments[0]?.total_amount || 0),
            collegePaidCount: completedCollegePayments[0]?.total || 0,
            collegePaidAmount: parseFloat(completedCollegePayments[0]?.total_amount || 0),
            recruiterPaidCount: completedRecruiterPayments[0]?.total || 0,
            recruiterPaidAmount: parseFloat(completedRecruiterPayments[0]?.total_amount || 0)
        },
        trends: {
            newAdmins30d: newAdmins30d[0]?.total || 0
        }
    };
};

const getCreditsOverview = async ({ page = 1, limit = 20, search = '', status = [], syncFrom = '', syncTo = '', sortOrder = 'NAME_ASC' } = {}) => {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;

    const params = [];
    let whereClause = 'WHERE 1=1';

    if (status && status.length > 0) {
        const statuses = Array.isArray(status) ? status : [status];
        const placeholders = statuses.map(() => '?').join(',');
        whereClause += ` AND is_active IN (${placeholders})`;
        statuses.forEach(s => {
            const val = s.toLowerCase() === 'active' ? 1 : 0;
            params.push(val);
        });
    }

    if (syncFrom) {
        whereClause += ' AND last_synced_at >= ?';
        params.push(syncFrom);
    }

    if (syncTo) {
        whereClause += ' AND last_synced_at <= ?';
        params.push(syncTo + ' 23:59:59');
    }

    if (search) {
        const like = `%${search}%`;
        whereClause += ' AND (client_name LIKE ? OR admin_email LIKE ? OR client_schema LIKE ?)';
        params.push(like, like, like);
    }

    let orderBySql = 'client ASC';
    if (sortOrder === 'NAME_DESC') orderBySql = 'client DESC';
    if (sortOrder === 'LAST_SYNC_DESC') orderBySql = 'lastSyncedAt DESC';
    if (sortOrder === 'LAST_SYNC_ASC') orderBySql = 'lastSyncedAt ASC';

    const baseWhere = 'WHERE is_admin = 1 AND client IS NOT NULL AND client <> ""';
    const authParams = [];
    let authWhere = baseWhere;

    if (search) {
        const like = `%${search}%`;
        authWhere += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR client LIKE ?)';
        authParams.push(like, like, like, like);
    }

    const shouldFilterInMemory = !!(syncFrom || syncTo || (status && status.length > 0));

    const authLimitClause = shouldFilterInMemory ? '' : `LIMIT ${safeLimit} OFFSET ${offset}`;

    const admins = await db.authQuery(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.client, r.code as role_code
         FROM auth_db.users u
         LEFT JOIN auth_db.roles r ON u.role_id = r.id
         ${authWhere}
         ORDER BY u.created_at DESC
         ${authLimitClause}`,
        authParams
    );

    const creditRows = await Promise.all(
        admins.map(async (admin) => {
            const credits = await fetchCreditsForSchema(admin.client, admin.role_code);
            if (!credits) {
                return null;
            }

            return {
                client: admin.client,
                clientSchema: admin.client,
                adminEmail: admin.email,
                adminId: admin.id,
                roleCode: admin.role_code,
                ...credits
            };
        })
    );

    let byClient = creditRows.filter(Boolean);

    if (status && status.length > 0) {
        const statusSet = new Set((Array.isArray(status) ? status : [status]).map(s => s.toLowerCase()));
        byClient = byClient.filter((row) => {
            if (statusSet.has('active') && row.isActive) return true;
            if (statusSet.has('inactive') && !row.isActive) return true;
            return false;
        });
    }

    if (syncFrom) {
        const fromDate = new Date(syncFrom);
        byClient = byClient.filter(row => row.lastSyncedAt && new Date(row.lastSyncedAt) >= fromDate);
    }

    if (syncTo) {
        const toDate = new Date(`${syncTo}T23:59:59`);
        byClient = byClient.filter(row => row.lastSyncedAt && new Date(row.lastSyncedAt) <= toDate);
    }

    const total = shouldFilterInMemory
        ? byClient.length
        : (await db.authQuery(`SELECT COUNT(*) AS total FROM auth_db.users ${authWhere}`, authParams))[0]?.total || 0;

    if (orderBySql) {
        const [field, direction] = orderBySql.split(' ');
        byClient.sort((a, b) => {
            const left = a[field] || '';
            const right = b[field] || '';
            if (left < right) return direction === 'DESC' ? 1 : -1;
            if (left > right) return direction === 'DESC' ? -1 : 1;
            return 0;
        });
    }

    if (shouldFilterInMemory) {
        const startIndex = (safePage - 1) * safeLimit;
        byClient = byClient.slice(startIndex, startIndex + safeLimit);
    }

    return {
        byClient,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            totalPages: Math.ceil(total / safeLimit)
        }
    };
};

const getActivityFeed = async (limit = 8) => {
    // Ensure limit is an integer and sanitize for SQL injection
    const limitInt = Math.max(1, Math.min(parseInt(limit, 10) || 8, 100));

    // Query auth_db for audit logs (using direct integer in query as LIMIT doesn't accept parameters in some MySQL versions)
    const rows = await db.authQuery(
        `SELECT al.id,
                al.action,
                al.resource_type,
                al.resource_id,
                al.status,
                al.created_at,
                u.email,
                u.first_name,
                u.last_name
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         ORDER BY al.created_at DESC
         LIMIT ${limitInt}`
    );

    return rows.map((row) => ({
        id: row.id,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        status: row.status,
        createdAt: row.created_at,
        user: row.email
            ? {
                email: row.email,
                name: [row.first_name, row.last_name].filter(Boolean).join(' ')
            }
            : null
    }));
};

const checkServiceHealth = async (name, url) => {
    const start = Date.now();
    try {
        const response = await axios.get(url, { timeout: 5000 });
        return {
            name,
            status: response.status === 200 ? 'healthy' : 'degraded',
            latencyMs: Date.now() - start,
            healthUrl: url
        };
    } catch (error) {
        return {
            name,
            status: 'down',
            latencyMs: null,
            healthUrl: url
        };
    }
};

const getServiceHealth = async () => {
    let superadminDbStatus = 'healthy';
    let authDbStatus = 'healthy';

    try {
        await db.query('SELECT 1');
    } catch (error) {
        superadminDbStatus = 'down';
    }

    try {
        await db.authQuery('SELECT 1');
    } catch (error) {
        authDbStatus = 'down';
    }

    const services = await Promise.all([
        checkServiceHealth('superadmin-backend', `${config.authServiceUrl}/health`), 
        checkServiceHealth('admin-backend', `${config.adminBackendUrl}/health`),
        checkServiceHealth('auth', `${config.authServiceUrl}/health`),
        checkServiceHealth('candidate-backend', `${config.candidateServiceUrl}/health`),
        checkServiceHealth('ai-service', `${config.aiServiceUrl}/health`),
        checkServiceHealth('streaming', `${config.streamingServiceUrl}/health`)
    ]);

    return {
        database: {
            superadmin_db: superadminDbStatus,
            auth_db: authDbStatus
        },
        services
    };
};

const getAdminList = async ({ search = '', limit = 15, page = 1 } = {}) => {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.max(1, parseInt(limit, 10) || 15);
    const offset = (safePage - 1) * safeLimit;

    const params = [];
    let whereClause = 'WHERE is_admin = 1 AND client IS NOT NULL';

    if (search) {
        const like = `%${search}%`;
        whereClause += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR client LIKE ?)';
        params.push(like, like, like, like);
    }

    const countRows = await db.authQuery(
        `SELECT COUNT(*) AS total FROM auth_db.users ${whereClause}`,
        params
    );

    const rows = await db.authQuery(
        `SELECT id, email, first_name, last_name, client 
         FROM auth_db.users 
         ${whereClause} 
         ORDER BY created_at DESC 
         LIMIT ${safeLimit} OFFSET ${offset}`,
        params
    );

    return {
        items: rows.map(r => ({
            id: r.id,
            email: r.email,
            name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email,
            client: r.client
        })),
        pagination: {
            total: countRows[0]?.total || 0,
            page: safePage,
            limit: safeLimit
        }
    };
};

const buildDateRange = (period, year, month) => {
    if (period === 'all') {
        return { start: null, end: null };
    }

    const now = new Date();
    let start;
    let end;

    let targetYear = parseInt(year, 10) || now.getFullYear();
    let targetMonth = now.getMonth();

    if (period === 'yearly') {
        start = new Date(Date.UTC(targetYear, 0, 1));
        end = new Date(Date.UTC(targetYear + 1, 0, 1));
    } else {
        // Handle month as 'YYYY-MM' or just 'MM' or undefined
        if (typeof month === 'string' && month.includes('-')) {
            const parts = month.split('-');
            targetYear = parseInt(parts[0], 10) || targetYear;
            targetMonth = (parseInt(parts[1], 10) || 1) - 1;
        } else if (month !== undefined) {
            targetMonth = (parseInt(month, 10) || 1) - 1;
        }

        start = new Date(Date.UTC(targetYear, targetMonth, 1));
        end = new Date(Date.UTC(targetYear, targetMonth + 1, 1));
    }

    // Check for invalid dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        // Fallback to current month if something went wrong
        start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
        end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));
    }

    return { start, end };
};

const buildLabels = (period, start) => {
    if (period === 'yearly') {
        return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }

    const labels = [];
    const current = new Date(start.getTime());
    while (current.getUTCMonth() === start.getUTCMonth()) {
        labels.push(current.toISOString().slice(0, 10));
        current.setUTCDate(current.getUTCDate() + 1);
    }
    return labels;
};

const mapRowsToSeries = (labels, rows, key, labelFormatter) => {
    const series = labels.map((label) => ({ label, value: 0 }));
    const rowMap = new Map();
    rows.forEach((row) => {
        rowMap.set(labelFormatter(row), row[key] || 0);
    });
    series.forEach((item) => {
        if (rowMap.has(item.label)) {
            item.value = rowMap.get(item.label);
        }
    });
    return series;
};

const getTrends = async ({ period = 'monthly', year, month, adminId } = {}) => {
    const { start, end } = buildDateRange(period, year, month);
    const isAllTime = period === 'all';
    const labels = isAllTime ? [] : buildLabels(period, start);

    // Initial series for trends (only if not all-time)
    let paymentAmountSeries = [];
    let paymentCountSeries = [];
    let adminCountSeries = [];

    if (!isAllTime) {
        const paymentRows = await db.query(
            period === 'yearly'
                ? `SELECT MONTH(payment_date) as bucket,
                          COALESCE(SUM(amount), 0) as total_amount,
                          COUNT(*) as total_count
                   FROM payments
                   WHERE payment_status = "COMPLETED"
                     AND payment_date >= ?
                     AND payment_date < ?
                   GROUP BY MONTH(payment_date)
                   ORDER BY MONTH(payment_date)`
                : `SELECT DATE(payment_date) as bucket,
                          COALESCE(SUM(amount), 0) as total_amount,
                          COUNT(*) as total_count
                   FROM payments
                   WHERE payment_status = "COMPLETED"
                     AND payment_date >= ?
                     AND payment_date < ?
                   GROUP BY DATE(payment_date)
                   ORDER BY DATE(payment_date)`,
            [start, end]
        );

        const adminRows = await db.authQuery(
            period === 'yearly'
                ? `SELECT MONTH(created_at) as bucket,
                          COUNT(*) as total_count
                   FROM auth_db.users
                   WHERE is_admin = 1
                     AND client IS NOT NULL
                     AND created_at >= ?
                     AND created_at < ?
                   GROUP BY MONTH(created_at)
                   ORDER BY MONTH(created_at)`
                : `SELECT DATE(created_at) as bucket,
                          COUNT(*) as total_count
                   FROM auth_db.users
                   WHERE is_admin = 1
                     AND client IS NOT NULL
                     AND created_at >= ?
                     AND created_at < ?
                   GROUP BY DATE(created_at)
                   ORDER BY DATE(created_at)`,
            [start, end]
        );

        const labelFormatter = (row) => {
            if (period === 'yearly') {
                const index = (row.bucket || 1) - 1;
                return labels[index] || labels[0];
            }
            return new Date(row.bucket).toISOString().slice(0, 10);
        };

        paymentAmountSeries = mapRowsToSeries(labels, paymentRows, 'total_amount', labelFormatter);
        paymentCountSeries = mapRowsToSeries(labels, paymentRows, 'total_count', labelFormatter);
        adminCountSeries = mapRowsToSeries(labels, adminRows, 'total_count', labelFormatter);
    }

    // Get Distributions (Always provided)
    const adminTypeParams = start ? [start, end] : [];
    const paymentTypeParams = start ? [start, end] : [];

    const [adminTypeRows, paymentTypeRows, creditUsageRows] = await Promise.all([
        // Admin types distribution by role
        db.authQuery(`
            SELECT r.code as role_code, COUNT(*) as count 
            FROM auth_db.users u
            LEFT JOIN auth_db.roles r ON u.role_id = r.id
            WHERE u.is_admin = 1 AND u.client IS NOT NULL 
            ${start ? 'AND u.created_at >= ? AND u.created_at < ?' : ''}
            GROUP BY r.code
        `, adminTypeParams),
        // Payment types distribution
        db.query(`
            SELECT payment_type, COUNT(*) as count 
            FROM payments 
            WHERE payment_status = "COMPLETED" 
            ${start ? 'AND payment_date >= ? AND payment_date < ?' : ''}
            GROUP BY payment_type
        `, paymentTypeParams),
        // Overall credit usage totals or specific admin
        (async () => {
            const aggregate = {
                utilized_interview: 0,
                remaining_interview: 0,
                utilized_position: 0,
                remaining_position: 0,
                utilized_screening: 0,
                remaining_screening: 0
            };

            const getClientSchemas = async () => {
                if (adminId) {
                    const rows = await db.authQuery(
                        'SELECT client FROM auth_db.users WHERE id = ? AND is_admin = 1',
                        [adminId]
                    );
                    return rows[0]?.client ? [rows[0].client] : [];
                }

                const rows = await db.authQuery(
                    `SELECT client FROM auth_db.users
                     WHERE is_admin = 1 AND client IS NOT NULL AND client <> ''`,
                    []
                );
                return rows.map(row => row.client).filter(Boolean);
            };

            const schemas = await getClientSchemas();
            if (!schemas.length) return [aggregate];

            const results = await Promise.all(
                schemas.map(async (schema) => {
                    const credits = await fetchCreditsForSchema(schema);
                    return credits || null;
                })
            );

            results.filter(Boolean).forEach((credits) => {
                aggregate.utilized_interview += credits.utilizedInterviewCredits || 0;
                aggregate.remaining_interview += credits.remainingInterviewCredits || 0;
                aggregate.utilized_position += credits.utilizedPositionCredits || 0;
                aggregate.remaining_position += credits.remainingPositionCredits || 0;
                aggregate.utilized_screening += credits.utilizedScreeningCredits || 0;
                aggregate.remaining_screening += credits.remainingScreeningCredits || 0;
            });

            return [aggregate];
        })()
    ]);

    const adminTypeCounts = { 'College': 0, 'Recruiter': 0 };
    adminTypeRows.forEach(r => {
        const name = r.role_code === 'ADMIN' ? 'College' : 'Recruiter';
        adminTypeCounts[name] = r.count;
    });
    const adminTypes = Object.entries(adminTypeCounts).map(([name, value]) => ({ name, value }));

    const paymentTypeCounts = {
        'INTERVIEW CREDITS': 0,
        'POSITION CREDITS': 0,
        'SCREENING CREDITS': 0,
        'SUBSCRIPTION': 0,
        'ADDON': 0
    };
    paymentTypeRows.forEach(r => {
        const rawType = r.payment_type ? String(r.payment_type) : '';
        if (!rawType) {
            return;
        }
        const name = rawType.replace('_', ' ');
        if (paymentTypeCounts.hasOwnProperty(name)) {
            paymentTypeCounts[name] = r.count;
        }
    });
    const paymentTypes = Object.entries(paymentTypeCounts).map(([name, value]) => ({ name, value }));

    const creditUsageData = creditUsageRows[0] || {};
    const creditUsage = [
        { name: 'Utilized Interview', value: parseFloat(creditUsageData.utilized_interview || 0) },
        { name: 'Remaining Interview', value: parseFloat(creditUsageData.remaining_interview || 0) },
        { name: 'Utilized Position', value: parseFloat(creditUsageData.utilized_position || 0) },
        { name: 'Remaining Position', value: parseFloat(creditUsageData.remaining_position || 0) },
        { name: 'Utilized Screening', value: parseFloat(creditUsageData.utilized_screening || 0) },
        { name: 'Remaining Screening', value: parseFloat(creditUsageData.remaining_screening || 0) }
    ];

    return {
        period,
        range: {
            start: start ? start.toISOString().slice(0, 10) : 'ALL',
            end: end ? end.toISOString().slice(0, 10) : 'ALL'
        },
        labels,
        payments: isAllTime ? null : {
            amount: paymentAmountSeries,
            count: paymentCountSeries
        },
        admins: isAllTime ? null : {
            count: adminCountSeries
        },
        distributions: {
            adminTypes,
            paymentTypes,
            creditUsage
        }
    };
};

module.exports = {
    getDashboardSummary,
    getCreditsOverview,
    getActivityFeed,
    getServiceHealth,
    getTrends,
    getAdminList
};
