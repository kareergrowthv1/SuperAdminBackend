/**
 * Seed default candidate plans: Basic, Standard, Premium.
 * Run after 002_candidate_plans migration. Idempotent: uses INSERT IGNORE or ON DUPLICATE KEY UPDATE.
 * Usage: node scripts/seed-candidate-plans.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const PLANS = [
  {
    id: 'a1b2c3d4-0001-4000-8000-000000000001',
    name: 'Basic',
    slug: 'basic',
    description: 'Office coding, AI mock test (General + Position, limited), daily quiz, daily fresh jobs.',
    pricePerMonth: 199,
    pricePerThreeMonths: 549,
    sortOrder: 1,
    permissions: {
      round1General: true,
      round2Position: true,
      round3Coding: false,
      round4Aptitude: false,
      resumeBuilder: false,
      atsResumeChecker: false,
      dailyJobs: true,
      linkedinRecruiters: false,
      hrMails: false,
      quiz: true,
      trendingJobs: false,
      offlineCoding: true,
      round1ReportLevel: 'min',
      round2ReportLevel: 'min',
      round3ReportLevel: 'none',
      round4ReportLevel: 'none'
    }
  },
  {
    id: 'a1b2c3d4-0002-4000-8000-000000000002',
    name: 'Standard',
    slug: 'standard',
    description: 'Basic + Aptitude & coding mock test (limited), LinkedIn recruiter jobs, Resume score (full), Fake offer detectors.',
    pricePerMonth: 449,
    pricePerThreeMonths: 1299,
    sortOrder: 2,
    permissions: {
      round1General: true,
      round2Position: true,
      round3Coding: true,
      round4Aptitude: true,
      resumeBuilder: false,
      atsResumeChecker: true,
      dailyJobs: true,
      linkedinRecruiters: true,
      hrMails: false,
      quiz: true,
      trendingJobs: false,
      offlineCoding: true,
      round1ReportLevel: 'standard',
      round2ReportLevel: 'standard',
      round3ReportLevel: 'min',
      round4ReportLevel: 'min'
    }
  },
  {
    id: 'a1b2c3d4-0003-4000-8000-000000000003',
    name: 'Premium',
    slug: 'premium',
    description: 'Basic + Standard + All 4 rounds mock, Resume builder (premium templates), Company HR emails.',
    pricePerMonth: 999,
    pricePerThreeMonths: 2899,
    sortOrder: 3,
    permissions: {
      round1General: true,
      round2Position: true,
      round3Coding: true,
      round4Aptitude: true,
      resumeBuilder: true,
      atsResumeChecker: true,
      dailyJobs: true,
      linkedinRecruiters: true,
      hrMails: true,
      quiz: true,
      trendingJobs: true,
      offlineCoding: true,
      round1ReportLevel: 'complete',
      round2ReportLevel: 'complete',
      round3ReportLevel: 'complete',
      round4ReportLevel: 'complete'
    }
  }
];

async function run() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'superadmin_db'
  };
  if (!config.user || !config.password) {
    console.error('Set DB_USER and DB_PASSWORD in .env');
    process.exit(1);
  }
  const conn = await mysql.createConnection(config);
  try {
    for (const p of PLANS) {
      const perms = JSON.stringify(p.permissions);
      await conn.execute(
        `INSERT INTO candidate_plans (id, name, slug, description, price_per_month, price_per_three_months, is_active, sort_order, permissions)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description),
         price_per_month = VALUES(price_per_month), price_per_three_months = VALUES(price_per_three_months),
         sort_order = VALUES(sort_order), permissions = VALUES(permissions), updated_at = CURRENT_TIMESTAMP`,
        [p.id, p.name, p.slug, p.description, p.pricePerMonth, p.pricePerThreeMonths, p.sortOrder, perms]
      );
    }
    console.log('Seed candidate plans completed: Basic, Standard, Premium.');
  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
