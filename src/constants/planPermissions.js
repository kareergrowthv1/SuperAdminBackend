/**
 * Candidate plan permission keys and report levels.
 * Used to ensure API always returns a consistent permissions shape.
 */

const FEATURE_KEYS = [
  'round1General',
  'round2Position',
  'round3Coding',
  'round4Aptitude',
  'resumeBuilder',
  'atsResumeChecker',
  'dailyJobs',
  'linkedinRecruiters',
  'hrMails',
  'quiz',
  'trendingJobs',
  'offlineCoding'
];

const REPORT_LEVEL_KEYS = [
  'round1ReportLevel',
  'round2ReportLevel',
  'round3ReportLevel',
  'round4ReportLevel',
  'resumeReportLevel'
];

const REPORT_LEVELS = ['none', 'min', 'standard', 'complete'];

const DEFAULT_PERMISSIONS = Object.freeze({
  round1General: false,
  round2Position: false,
  round3Coding: false,
  round4Aptitude: false,
  resumeBuilder: false,
  atsResumeChecker: false,
  dailyJobs: false,
  linkedinRecruiters: false,
  hrMails: false,
  quiz: false,
  trendingJobs: false,
  offlineCoding: false,
  round1ReportLevel: 'none',
  round2ReportLevel: 'none',
  round3ReportLevel: 'none',
  round4ReportLevel: 'none',
  resumeReportLevel: 'none'
});

function normalizePermissions(permissions) {
  if (!permissions || typeof permissions !== 'object') {
    return { ...DEFAULT_PERMISSIONS };
  }
  const out = { ...DEFAULT_PERMISSIONS };
  FEATURE_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(permissions, key)) {
      out[key] = Boolean(permissions[key]);
    }
  });
  REPORT_LEVEL_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(permissions, key) && REPORT_LEVELS.includes(permissions[key])) {
      out[key] = permissions[key];
    }
  });
  return out;
}

module.exports = {
  FEATURE_KEYS,
  REPORT_LEVEL_KEYS,
  REPORT_LEVELS,
  DEFAULT_PERMISSIONS,
  normalizePermissions
};
