const { query } = require('../config/db');
const { requireSuperadmin } = require('../utils/requireSuperadmin');

async function getAll(req, res) {
  try {
    const rows = await query('SELECT * FROM report_analysis_levels WHERE is_active = 1 ORDER BY depth_score ASC');
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('[reportLevelController.getAll]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch report levels' });
  }
}

async function update(req, res) {
  const isSuperadmin = await requireSuperadmin(req, res);
  if (!isSuperadmin) return;

  try {
    const { id } = req.params;
    const { label, depth_score, description, is_active } = req.body;
    
    await query(
      `UPDATE report_analysis_levels 
       SET label = ?, depth_score = ?, description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [label, depth_score, description, is_active ? 1 : 0, id]
    );

    return res.status(200).json({ success: true, message: 'Report level updated successfully' });
  } catch (err) {
    console.error('[reportLevelController.update]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update report level' });
  }
}

module.exports = { getAll, update };
