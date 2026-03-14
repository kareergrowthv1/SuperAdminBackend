const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/db');
const { normalizePermissions } = require('../constants/planPermissions');


function rowToPlan(row) {
  if (!row) return null;
  let permissions = row.permissions;
  if (Buffer.isBuffer(permissions)) {
    permissions = permissions.toString('utf8');
  }
  if (typeof permissions === 'string') {
    try {
      permissions = JSON.parse(permissions);
    } catch {
      permissions = {};
    }
  }
  if (permissions == null || typeof permissions !== 'object') {
    permissions = {};
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || '',
    pricePerMonth: Number(row.price_per_month) || 0,
    pricePerThreeMonths: Number(row.price_per_three_months) || 0,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order) || 0,
    permissions: normalizePermissions(permissions),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getAll() {
  const rows = await query(
    `SELECT id, name, slug, description, price_per_month, price_per_three_months,
            is_active, sort_order, permissions, created_at, updated_at
     FROM candidate_plans ORDER BY sort_order ASC, name ASC`
  );
  return (Array.isArray(rows) ? rows : []).map(rowToPlan);
}

async function getById(id) {
  const rows = await query(
    `SELECT id, name, slug, description, price_per_month, price_per_three_months,
            is_active, sort_order, permissions, created_at, updated_at
     FROM candidate_plans WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rowToPlan(rows[0]) : null;
}

async function getBySlug(slug) {
  const rows = await query(
    `SELECT id, name, slug, description, price_per_month, price_per_three_months,
            is_active, sort_order, permissions, created_at, updated_at
     FROM candidate_plans WHERE slug = ? AND is_active = 1 LIMIT 1`,
    [slug]
  );
  return rows.length > 0 ? rowToPlan(rows[0]) : null;
}

async function create(data) {
  const id = data.id || uuidv4();
  const permissions = normalizePermissions(data.permissions);
  const permissionsJson = JSON.stringify(permissions);
  await query(
    `INSERT INTO candidate_plans (id, name, slug, description, price_per_month, price_per_three_months,
      is_active, sort_order, permissions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name || '',
      (data.slug || '').trim().toLowerCase() || data.name?.trim().toLowerCase().replace(/\s+/g, '-') || 'plan',
      data.description || null,
      Number(data.pricePerMonth) || 0,
      Number(data.pricePerThreeMonths) || 0,
      data.isActive !== false ? 1 : 0,
      Number(data.sortOrder) || 0,
      permissionsJson
    ]
  );
  return getById(id);
}

async function update(id, data) {
  const existing = await getById(id);
  if (!existing) return null;

  const permissions = normalizePermissions(data.permissions !== undefined ? data.permissions : existing.permissions);
  const permissionsJson = JSON.stringify(permissions);

  const name = data.name !== undefined ? data.name : existing.name;
  const slug = data.slug !== undefined ? (data.slug || '').trim().toLowerCase() : existing.slug;
  const description = data.description !== undefined ? data.description : existing.description;
  const pricePerMonth = data.pricePerMonth !== undefined ? Number(data.pricePerMonth) : existing.pricePerMonth;
  const pricePerThreeMonths = data.pricePerThreeMonths !== undefined ? Number(data.pricePerThreeMonths) : existing.pricePerThreeMonths;
  const isActive = data.isActive !== undefined ? Boolean(data.isActive) : existing.isActive;
  const sortOrder = data.sortOrder !== undefined ? Number(data.sortOrder) : existing.sortOrder;

  await query(
    `UPDATE candidate_plans SET name = ?, slug = ?, description = ?, price_per_month = ?, price_per_three_months = ?,
      is_active = ?, sort_order = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [name, slug, description, pricePerMonth, pricePerThreeMonths, isActive ? 1 : 0, sortOrder, permissionsJson, id]
  );
  return getById(id);
}

async function remove(id) {
  const existing = await getById(id);
  if (!existing) return false;
  await query(`DELETE FROM candidate_plans WHERE id = ?`, [id]);
  return true;
}

module.exports = {
  getAll,
  getById,
  getBySlug,
  create,
  update,
  remove
};
