const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql2/promise');
const config = require('../config');
const db = require('../config/db');

const getClientSchemas = async () => {
    const rows = await db.authQuery(
        `SELECT DISTINCT u.client, u.id as admin_user_id, u.email as admin_email, u.first_name, u.last_name, r.code as role_code
         FROM auth_db.users u
         LEFT JOIN auth_db.roles r ON u.role_id = r.id
         WHERE u.client IS NOT NULL
           AND u.client <> ''
           AND u.is_admin = 1`
    );

    return rows.map((row) => ({
        schema: row.client,
        adminUserId: row.admin_user_id,
        adminEmail: row.admin_email,
        clientName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.admin_email,
        roleCode: row.role_code
    })).filter((item) => item.schema);
};

const fetchCreditsFromClientDB = async (schemaName, roleCode = null) => {
    const pool = mysql.createPool({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: schemaName,
        waitForConnections: true,
        connectionLimit: 1,
        queueLimit: 0,
        charset: 'utf8mb4',
        timezone: '+00:00'
    });

    try {
        // Both ATS and College use 'credits' table in tenant DBs
        const creditsTable = 'credits';
        const isAtsRole = roleCode === 'ATS';
        
        const [rows] = await pool.query(
            `SELECT BIN_TO_UUID(id) as id,
                    total_interview_credits,
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
             LIMIT 1`
        );
        return rows[0] || null;
    } finally {
        await pool.end();
    }
};

const upsertCreditToSuperadminDB = async (clientInfo, creditData) => {
    // Disabled as per user requirement to only use client DBs
    return;
    /*
    if (!creditData) {
        return;
    }
    // ... rest of original code
    */
};

const updateSyncStatus = async (clientSchema, syncType, status, errorMessage = null, recordsSynced = 0) => {
    const existingRows = await db.query(
        `SELECT BIN_TO_UUID(id) as id FROM sync_status WHERE client_schema = ? AND sync_type = ?`,
        [clientSchema, syncType]
    );

    if (existingRows.length > 0) {
        await db.query(
            `UPDATE sync_status SET
                last_sync_at = NOW(),
                last_sync_status = ?,
                error_message = ?,
                records_synced = ?,
                updated_at = NOW()
             WHERE client_schema = ? AND sync_type = ?`,
            [status, errorMessage, recordsSynced, clientSchema, syncType]
        );
    } else {
        const idBuffer = Buffer.from(uuidv4().replace(/-/g, ''), 'hex');
        await db.query(
            `INSERT INTO sync_status (
                id, client_schema, sync_type, last_sync_at, last_sync_status,
                error_message, records_synced, created_at, updated_at
            ) VALUES (?, ?, ?, NOW(), ?, ?, ?, NOW(), NOW())`,
            [idBuffer, clientSchema, syncType, status, errorMessage, recordsSynced]
        );
    }
};

const syncAllCredits = async () => {
    const startTime = Date.now();
    let totalSynced = 0;
    let totalErrors = 0;

    try {
        const clients = await getClientSchemas();
        console.log(`[SyncService] Starting sync for ${clients.length} clients...`);

        for (const clientInfo of clients) {
            try {
                console.log(`[SyncService] Syncing credits for ${clientInfo.schema}...`);

                const creditData = await fetchCreditsFromClientDB(clientInfo.schema, clientInfo.roleCode);

                if (creditData) {
                    await upsertCreditToSuperadminDB(clientInfo, creditData);
                    await updateSyncStatus(clientInfo.schema, 'CREDITS', 'SUCCESS', null, 1);
                    totalSynced++;
                    console.log(`[SyncService] ✓ Synced ${clientInfo.schema}`);
                } else {
                    console.log(`[SyncService] ⚠ No active credits found for ${clientInfo.schema}`);
                    await updateSyncStatus(clientInfo.schema, 'CREDITS', 'SUCCESS', 'No active credits found', 0);
                }
            } catch (error) {
                totalErrors++;
                console.error(`[SyncService] ✗ Error syncing ${clientInfo.schema}:`, error.message);
                await updateSyncStatus(clientInfo.schema, 'CREDITS', 'FAILED', error.message, 0);
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[SyncService] Sync completed: ${totalSynced} synced, ${totalErrors} errors in ${duration}ms`);

        return {
            success: true,
            totalClients: clients.length,
            synced: totalSynced,
            errors: totalErrors,
            durationMs: duration
        };
    } catch (error) {
        console.error('[SyncService] Fatal error during sync:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

module.exports = {
    syncAllCredits,
    getClientSchemas,
    fetchCreditsFromClientDB,
    upsertCreditToSuperadminDB
};
