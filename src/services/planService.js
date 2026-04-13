const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/db');
const { normalizePermissions } = require('../constants/planPermissions');


function rowToPlan(row) {
  if (!row) return null;

  let permissions = row.permissions;
  if (Buffer.isBuffer(permissions)) permissions = permissions.toString('utf8');
  if (typeof permissions === 'string') {
    try { permissions = JSON.parse(permissions); } catch { permissions = {}; }
  }
  if (permissions == null || typeof permissions !== 'object') permissions = {};

  let features = row.features;
  if (Buffer.isBuffer(features)) features = features.toString('utf8');
  if (typeof features === 'string') {
    try { features = JSON.parse(features); } catch { features = []; }
  }
  if (!Array.isArray(features)) features = [];

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || '',
    interviewCredits: Number(row.interview_credits) || 0,
    positionCredits: Number(row.position_credits) || 0,
    price: Number(row.price) || 0,
    durationMonths: Number(row.duration_months) || 1,
    creditsPerMonth: Number(row.credits_per_month) || 0,
    bestFor: row.best_for || '',
    features,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order) || 0,
    permissions: normalizePermissions(permissions),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const SELECT_COLS = `id, name, slug, description, interview_credits, position_credits, price,
        duration_months, features, best_for, credits_per_month, is_active, sort_order, permissions, created_at, updated_at`;

async function getAll() {
  const rows = await query(
    `SELECT ${SELECT_COLS} FROM candidate_plans ORDER BY sort_order ASC, name ASC`
  );
  return (Array.isArray(rows) ? rows : []).map(rowToPlan);
}

async function getById(id) {
  const rows = await query(
    `SELECT ${SELECT_COLS} FROM candidate_plans WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rowToPlan(rows[0]) : null;
}

async function getBySlug(slug) {
  const rows = await query(
    `SELECT ${SELECT_COLS} FROM candidate_plans WHERE slug = ? AND is_active = 1 LIMIT 1`,
    [slug]
  );
  return rows.length > 0 ? rowToPlan(rows[0]) : null;
}

async function create(data) {
  const id = data.id || uuidv4();
  const permissions = normalizePermissions(data.permissions);
  const permissionsJson = JSON.stringify(permissions);
  const features = Array.isArray(data.features) ? data.features : [];
  const featuresJson = JSON.stringify(features);

  await query(
    `INSERT INTO candidate_plans (id, name, slug, description, interview_credits, position_credits, price,
      duration_months, features, is_active, sort_order, permissions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name || '',
      (data.slug || '').trim().toLowerCase() || data.name?.trim().toLowerCase().replace(/\s+/g, '-') || 'plan',
      data.description || null,
      Number(data.interviewCredits) || 0,
      Number(data.positionCredits) || 0,
      Number(data.price) || 0,
      Number(data.durationMonths) || 1,
      featuresJson,
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
  const features = Array.isArray(data.features) ? data.features : existing.features;

  const name = data.name !== undefined ? data.name : existing.name;
  const slug = data.slug !== undefined ? (data.slug || '').trim().toLowerCase() : existing.slug;
  const description = data.description !== undefined ? data.description : existing.description;
  const interviewCredits = data.interviewCredits !== undefined ? Number(data.interviewCredits) : existing.interviewCredits;
  const positionCredits = data.positionCredits !== undefined ? Number(data.positionCredits) : existing.positionCredits;
  const price = data.price !== undefined ? Number(data.price) : existing.price;
  const durationMonths = data.durationMonths !== undefined ? Number(data.durationMonths) : existing.durationMonths;
  const isActive = data.isActive !== undefined ? Boolean(data.isActive) : existing.isActive;
  const sortOrder = data.sortOrder !== undefined ? Number(data.sortOrder) : existing.sortOrder;

  await query(
    `UPDATE candidate_plans SET name = ?, slug = ?, description = ?, interview_credits = ?, position_credits = ?,
      price = ?, duration_months = ?, features = ?, is_active = ?, sort_order = ?, permissions = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [name, slug, description, interviewCredits, positionCredits, price, durationMonths,
     JSON.stringify(features), isActive ? 1 : 0, sortOrder, JSON.stringify(permissions), id]
  );
  return getById(id);
}

async function remove(id) {
  const existing = await getById(id);
  if (!existing) return false;
  await query(`DELETE FROM candidate_plans WHERE id = ?`, [id]);
  return true;
}

module.exports = { getAll, getById, getBySlug, create, update, remove };
