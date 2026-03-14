// Tenant-Aware Database Query Helper
// Ensures all queries include organization_id for tenant isolation
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('./logger');

class TenantAwareDB {
    /**
     * Execute query with automatic tenant filtering
     * @param {string} sql - SQL query (must include organization_id in WHERE clause)
     * @param {array} params - Query parameters
     * @param {string} tenantId - Organization ID
     * @returns {Promise<array>} Query results
     */
    async query(sql, params, tenantId) {
        try {
            // Security check: Ensure query includes organization_id filter
            if (!sql.toLowerCase().includes('organization_id')) {
                throw new Error(
                    'Query must include organization_id filter for tenant isolation. ' +
                    'Add WHERE organization_id = ? to your query.'
                );
            }

            // Execute query
            const results = await db.query(sql, params);
            
            logger.debug('Tenant-aware query executed', {
                tenantId,
                rowCount: results.length,
                queryPattern: sql.substring(0, 50)
            });

            return results;
        } catch (error) {
            logger.error('Tenant-aware query failed', {
                error: error.message,
                tenantId,
                queryPattern: sql.substring(0, 50)
            });
            throw error;
        }
    }

    /**
     * Execute query and return first row only
     * @param {string} sql - SQL query
     * @param {array} params - Query parameters
     * @param {string} tenantId - Organization ID
     * @returns {Promise<object|null>} First row or null
     */
    async queryOne(sql, params, tenantId) {
        const results = await this.query(sql, params, tenantId);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Find record by ID with tenant isolation
     * @param {string} table - Table name
     * @param {string} id - Record ID
     * @param {string} tenantId - Organization ID
     * @returns {Promise<object|null>} Record or null
     */
    async findById(table, id, tenantId) {
        try {
            const sql = `
                SELECT * FROM ${table}
                WHERE id = ? AND organization_id = ? AND is_active = true
            `;
            
            const results = await db.query(sql, [id, tenantId]);
            
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            logger.error('Find by ID failed', {
                error: error.message,
                table,
                id,
                tenantId
            });
            throw error;
        }
    }

    /**
     * Find all records with tenant filtering
     * @param {string} table - Table name
     * @param {string} tenantId - Organization ID
     * @param {object} options - Query options (limit, offset, orderBy)
     * @returns {Promise<array>} Records
     */
    async findAll(table, tenantId, options = {}) {
        try {
            const {
                limit = 100,
                offset = 0,
                orderBy = 'created_at',
                order = 'DESC',
                includeInactive = false
            } = options;

            const activeFilter = includeInactive ? '' : 'AND is_active = true';

            const sql = `
                SELECT * FROM ${table}
                WHERE organization_id = ? ${activeFilter}
                ORDER BY ${orderBy} ${order}
                LIMIT ? OFFSET ?
            `;

            const results = await db.query(sql, [tenantId, limit, offset]);

            logger.debug('Find all executed', {
                table,
                tenantId,
                count: results.length
            });

            return results;
        } catch (error) {
            logger.error('Find all failed', {
                error: error.message,
                table,
                tenantId
            });
            throw error;
        }
    }

    /**
     * Insert record with automatic tenant ID and UUID
     * @param {string} table - Table name
     * @param {object} data - Data to insert (without id and organization_id)
     * @param {string} tenantId - Organization ID
     * @returns {Promise<object>} Inserted record
     */
    async insert(table, data, tenantId) {
        try {
            const id = uuidv4();
            const now = new Date();

            // Add system fields
            const recordData = {
                id,
                organization_id: tenantId,
                ...data,
                created_at: now,
                updated_at: now
            };

            const columns = Object.keys(recordData);
            const placeholders = columns.map(() => '?');
            const values = Object.values(recordData);

            const sql = `
                INSERT INTO ${table} (${columns.join(', ')})
                VALUES (${placeholders.join(', ')})
            `;

            await db.query(sql, values);

            logger.info('Record inserted', {
                table,
                id,
                tenantId
            });

            // Fetch and return inserted record
            return await this.findById(table, id, tenantId);
        } catch (error) {
            logger.error('Insert failed', {
                error: error.message,
                table,
                tenantId
            });
            throw error;
        }
    }

    /**
     * Update record with tenant isolation
     * @param {string} table - Table name
     * @param {string} id - Record ID
     * @param {object} data - Data to update
     * @param {string} tenantId - Organization ID
     * @returns {Promise<object>} Updated record
     */
    async update(table, id, data, tenantId) {
        try {
            // Add updated_at
            const updateData = {
                ...data,
                updated_at: new Date()
            };

            const columns = Object.keys(updateData);
            const setClause = columns.map(col => `${col} = ?`).join(', ');
            const values = [...Object.values(updateData), id, tenantId];

            const sql = `
                UPDATE ${table}
                SET ${setClause}
                WHERE id = ? AND organization_id = ?
            `;

            const result = await db.query(sql, values);

            if (result.affectedRows === 0) {
                throw new Error('Record not found or access denied');
            }

            logger.info('Record updated', {
                table,
                id,
                tenantId,
                fieldsUpdated: columns.length
            });

            // Fetch and return updated record
            return await this.findById(table, id, tenantId);
        } catch (error) {
            logger.error('Update failed', {
                error: error.message,
                table,
                id,
                tenantId
            });
            throw error;
        }
    }

    /**
     * Soft delete record (set is_active = false)
     * @param {string} table - Table name
     * @param {string} id - Record ID
     * @param {string} tenantId - Organization ID
     * @returns {Promise<boolean>} Success
     */
    async softDelete(table, id, tenantId) {
        try {
            const now = new Date();

            const sql = `
                UPDATE ${table}
                SET is_active = false, deleted_at = ?, updated_at = ?
                WHERE id = ? AND organization_id = ?
            `;

            const result = await db.query(sql, [now, now, id, tenantId]);

            if (result.affectedRows === 0) {
                throw new Error('Record not found or access denied');
            }

            logger.info('Record soft deleted', {
                table,
                id,
                tenantId
            });

            return true;
        } catch (error) {
            logger.error('Soft delete failed', {
                error: error.message,
                table,
                id,
                tenantId
            });
            throw error;
        }
    }

    /**
     * Hard delete record (permanent)
     * USE WITH CAUTION
     * @param {string} table - Table name
     * @param {string} id - Record ID
     * @param {string} tenantId - Organization ID
     * @returns {Promise<boolean>} Success
     */
    async hardDelete(table, id, tenantId) {
        try {
            const sql = `
                DELETE FROM ${table}
                WHERE id = ? AND organization_id = ?
            `;

            const result = await db.query(sql, [id, tenantId]);

            if (result.affectedRows === 0) {
                throw new Error('Record not found or access denied');
            }

            logger.warn('Record hard deleted', {
                table,
                id,
                tenantId
            });

            return true;
        } catch (error) {
            logger.error('Hard delete failed', {
                error: error.message,
                table,
                id,
                tenantId
            });
            throw error;
        }
    }

    /**
     * Count records with tenant filtering
     * @param {string} table - Table name
     * @param {string} tenantId - Organization ID
     * @param {object} where - Additional where conditions
     * @returns {Promise<number>} Count
     */
    async count(table, tenantId, where = {}) {
        try {
            const conditions = ['organization_id = ?', 'is_active = true'];
            const params = [tenantId];

            // Add additional where conditions
            for (const [key, value] of Object.entries(where)) {
                conditions.push(`${key} = ?`);
                params.push(value);
            }

            const sql = `
                SELECT COUNT(*) as count
                FROM ${table}
                WHERE ${conditions.join(' AND ')}
            `;

            const result = await db.query(sql, params);
            return result[0].count;
        } catch (error) {
            logger.error('Count failed', {
                error: error.message,
                table,
                tenantId
            });
            throw error;
        }
    }

    /**
     * Check if record exists
     * @param {string} table - Table name
     * @param {string} id - Record ID
     * @param {string} tenantId - Organization ID
     * @returns {Promise<boolean>}
     */
    async exists(table, id, tenantId) {
        try {
            const sql = `
                SELECT 1 FROM ${table}
                WHERE id = ? AND organization_id = ? AND is_active = true
                LIMIT 1
            `;

            const result = await db.query(sql, [id, tenantId]);
            return result.length > 0;
        } catch (error) {
            logger.error('Exists check failed', {
                error: error.message,
                table,
                id,
                tenantId
            });
            return false;
        }
    }

    /**
     * Execute transaction with tenant context
     * @param {Function} callback - Async function that receives connection
     * @param {string} tenantId - Organization ID
     * @returns {Promise<any>} Result from callback
     */
    async transaction(callback, tenantId) {
        return await db.transaction(async (connection) => {
            // Pass both connection and tenantId to callback
            return await callback(connection, tenantId);
        });
    }

    /**
     * Bulk insert records
     * @param {string} table - Table name
     * @param {array} records - Array of data objects
     * @param {string} tenantId - Organization ID
     * @returns {Promise<number>} Number of inserted records
     */
    async bulkInsert(table, records, tenantId) {
        try {
            if (!records || records.length === 0) {
                return 0;
            }

            const now = new Date();
            const values = [];

            // Prepare values for bulk insert
            for (const data of records) {
                const id = uuidv4();
                const record = {
                    id,
                    organization_id: tenantId,
                    ...data,
                    created_at: now,
                    updated_at: now
                };
                values.push(Object.values(record));
            }

            // Get column names from first record
            const firstRecord = {
                id: uuidv4(),
                organization_id: tenantId,
                ...records[0],
                created_at: now,
                updated_at: now
            };
            const columns = Object.keys(firstRecord);

            const placeholders = values
                .map(() => `(${columns.map(() => '?').join(', ')})`)
                .join(', ');

            const sql = `
                INSERT INTO ${table} (${columns.join(', ')})
                VALUES ${placeholders}
            `;

            const flatValues = values.flat();
            await db.query(sql, flatValues);

            logger.info('Bulk insert completed', {
                table,
                count: records.length,
                tenantId
            });

            return records.length;
        } catch (error) {
            logger.error('Bulk insert failed', {
                error: error.message,
                table,
                tenantId,
                recordCount: records.length
            });
            throw error;
        }
    }
}

module.exports = new TenantAwareDB();
