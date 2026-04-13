const { ObjectId } = require('mongodb');
const { getCollection, COLLECTIONS } = require('../config/mongo');
const { requireSuperadmin } = require('../utils/requireSuperadmin');

async function getTemplates(req, res) {
  try {
    const { limit = 12, offset = 0 } = req.query;
    const safeLimit = Math.min(Number(limit) || 12, 100);
    const safeOffset = Number(offset) || 0;

    const templatesCol = await getCollection(COLLECTIONS.RESUME_TEMPLATES);
    const [templates, total] = await Promise.all([
      templatesCol
        .find({})
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .toArray(),
      templatesCol.countDocuments({})
    ]);

    return res.status(200).json({
      success: true,
      data: templates,
      meta: {
        total,
        limit: safeLimit,
        offset: safeOffset
      }
    });
  } catch (err) {
    console.error('[resumeTemplateController.getTemplates]', err.message || err);
    return res.status(500).json({ success: false, message: 'Failed to fetch resume templates' });
  }
}

async function getTemplateById(req, res) {
  try {
    const { id } = req.params;
    const templatesCol = await getCollection(COLLECTIONS.RESUME_TEMPLATES);
    const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { key: id };
    const template = await templatesCol.findOne(filter);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    return res.status(200).json({ success: true, data: template });
  } catch (err) {
    console.error('[resumeTemplateController.getTemplateById]', err.message || err);
    return res.status(500).json({ success: false, message: 'Failed to fetch template' });
  }
}

async function createTemplate(req, res) {
  const isSuperadmin = await requireSuperadmin(req, res);
  if (!isSuperadmin) return;

  try {
    const { key, name, description, htmlTemplate, sections, styleConfig, tags, thumbnailColor, availablePlanIds, availablePlanNames } = req.body || {};
    if (!name || !htmlTemplate || !Array.isArray(sections)) {
      return res.status(400).json({ success: false, message: 'name, htmlTemplate and sections are required' });
    }

    const templatesCol = await getCollection(COLLECTIONS.RESUME_TEMPLATES);
    const now = new Date().toISOString();
    const safeKey = (key || String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-+|-+$/g, '');

    const payload = {
      key: safeKey,
      name,
      description: description || '',
      htmlTemplate,
      sections,
      styleConfig: styleConfig || {},
      tags: Array.isArray(tags) ? tags : [],
      availablePlanIds: Array.isArray(availablePlanIds) ? availablePlanIds : [],
      availablePlanNames: Array.isArray(availablePlanNames) ? availablePlanNames : [],
      thumbnailColor: thumbnailColor || '#2563eb',
      isSystemTemplate: false,
      createdAt: now,
      updatedAt: now
    };

    const result = await templatesCol.insertOne(payload);
    return res.status(201).json({ success: true, data: { ...payload, _id: result.insertedId } });
  } catch (err) {
    console.error('[resumeTemplateController.createTemplate]', err.message || err);
    return res.status(500).json({ success: false, message: 'Failed to create template' });
  }
}

async function updateTemplate(req, res) {
  const isSuperadmin = await requireSuperadmin(req, res);
  if (!isSuperadmin) return;

  try {
    const { id } = req.params;
    const templatesCol = await getCollection(COLLECTIONS.RESUME_TEMPLATES);
    const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { key: id };

    const patch = { ...req.body, updatedAt: new Date().toISOString() };
    if (Object.prototype.hasOwnProperty.call(patch, 'availablePlanIds') && !Array.isArray(patch.availablePlanIds)) {
      patch.availablePlanIds = [];
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'availablePlanNames') && !Array.isArray(patch.availablePlanNames)) {
      patch.availablePlanNames = [];
    }
    if (Object.prototype.hasOwnProperty.call(patch, '_id')) delete patch._id;

    const updated = await templatesCol.findOneAndUpdate(
      filter,
      { $set: patch },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error('[resumeTemplateController.updateTemplate]', err.message || err);
    return res.status(500).json({ success: false, message: 'Failed to update template' });
  }
}

async function deleteTemplate(req, res) {
  const isSuperadmin = await requireSuperadmin(req, res);
  if (!isSuperadmin) return;

  try {
    const { id } = req.params;
    const templatesCol = await getCollection(COLLECTIONS.RESUME_TEMPLATES);
    const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { key: id };

    const result = await templatesCol.deleteOne(filter);
    if (!result.deletedCount) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    return res.status(200).json({ success: true, message: 'Template deleted successfully' });
  } catch (err) {
    console.error('[resumeTemplateController.deleteTemplate]', err.message || err);
    return res.status(500).json({ success: false, message: 'Failed to delete template' });
  }
}

async function getResumeReports(req, res) {
  try {
    const { candidateId, limit = 50, offset = 0 } = req.query;
    const reportsCol = await getCollection(COLLECTIONS.RESUME_REPORTS);

    const filter = {};
    if (candidateId) {
      filter.candidateId = Number.isNaN(Number(candidateId)) ? candidateId : Number(candidateId);
    }

    const safeLimit = Math.min(Number(limit) || 50, 200);
    const safeOffset = Number(offset) || 0;

    const [reports, total] = await Promise.all([
      reportsCol
        .find(filter, { projection: { fileName: 1, candidateId: 1, overallScore: 1, reportLevel: 1, createdAt: 1, candidate_info: 1 } })
        .sort({ createdAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .toArray(),
      reportsCol.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: reports,
      meta: {
        total,
        limit: safeLimit,
        offset: safeOffset
      }
    });
  } catch (err) {
    console.error('[resumeTemplateController.getResumeReports]', err.message || err);
    return res.status(500).json({ success: false, message: 'Failed to fetch resume reports' });
  }
}

module.exports = {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getResumeReports
};
