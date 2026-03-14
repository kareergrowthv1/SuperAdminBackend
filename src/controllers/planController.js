const planService = require('../services/planService');
const { requireSuperadmin } = require('../utils/requireSuperadmin');

async function getAll(req, res) {
  try {
    const plans = await planService.getAll();
    return res.status(200).json({ success: true, data: plans });
  } catch (err) {
    console.error('[planController.getAll]', err.message || err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch plans'
    });
  }
}

async function getById(req, res) {
  try {
    const { id } = req.params;
    const plan = await planService.getById(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    return res.status(200).json({ success: true, data: plan });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch plan'
    });
  }
}

async function create(req, res) {
  const isSuperadmin = await requireSuperadmin(req, res);
  if (!isSuperadmin) return;
  try {
    const plan = await planService.create(req.body);
    return res.status(201).json({ success: true, data: plan, message: 'Plan created successfully' });
  } catch (err) {
    const status = err.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({
      success: false,
      message: err.code === 'ER_DUP_ENTRY' ? 'A plan with this slug already exists' : (err.message || 'Failed to create plan')
    });
  }
}

async function update(req, res) {
  const isSuperadmin = await requireSuperadmin(req, res);
  if (!isSuperadmin) return;
  try {
    const { id } = req.params;
    const plan = await planService.update(id, req.body);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    return res.status(200).json({ success: true, data: plan, message: 'Plan updated successfully' });
  } catch (err) {
    const status = err.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({
      success: false,
      message: err.code === 'ER_DUP_ENTRY' ? 'A plan with this slug already exists' : (err.message || 'Failed to update plan')
    });
  }
}

async function remove(req, res) {
  const isSuperadmin = await requireSuperadmin(req, res);
  if (!isSuperadmin) return;
  try {
    const { id } = req.params;
    const deleted = await planService.remove(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    return res.status(200).json({ success: true, message: 'Plan deleted successfully' });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete plan'
    });
  }
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove
};
