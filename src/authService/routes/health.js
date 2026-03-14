const express = require('express');
const router = express.Router();
const config = require('../config');
const db = require('../config/database');
const redis = require('../config/redis');

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Service is healthy',
    service: 'KareerGrowth Auth Service',
    version: '1.0.0',
    environment: config.env,
    timestamp: new Date().toISOString()
  });
});

router.get('/healthz', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Service is healthy',
    service: 'KareerGrowth Auth Service',
    version: '1.0.0',
    environment: config.env,
    timestamp: new Date().toISOString()
  });
});

router.get('/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    const redisOk = await redis.set('health:check', 'ok', 5);

    res.status(200).json({
      success: true,
      message: 'Service is ready',
      checks: {
        database: 'ok',
        redis: redisOk ? 'ok' : 'unavailable (running without cache)'
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Service not ready',
      error: error.message
    });
  }
});

module.exports = router;
