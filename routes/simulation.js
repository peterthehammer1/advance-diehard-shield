const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');
const simulator = require('../services/simulator');

// GET simulation profiles
router.get('/profiles', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM simulation_profiles ORDER BY behavior');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching profiles:', err);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

// GET simulation status
router.get('/status', (req, res) => {
  res.json(simulator.getStatus());
});

// POST start simulation
router.post('/start', (req, res) => {
  if (simulator.isRunning()) {
    return res.json({ message: 'Simulation already running', ...simulator.getStatus() });
  }

  // Wire up SSE clients on first start
  simulator.setSseClients(req.app.get('sseClients'));

  const intervalMs = Math.max(1000, Math.min(10000, parseInt(req.body.interval) || 3000));
  simulator.start(intervalMs);
  res.json({ message: 'Simulation started', ...simulator.getStatus() });
});

// POST stop simulation
router.post('/stop', (req, res) => {
  simulator.stop();
  res.json({ message: 'Simulation stopped', ...simulator.getStatus() });
});

// POST trigger a single call from a specific profile
router.post('/single', async (req, res) => {
  try {
    simulator.setSseClients(req.app.get('sseClients'));
    const { profile_id } = req.body;
    const call = await simulator.generateCall(profile_id || null);
    res.json(call);
  } catch (err) {
    console.error('Error generating single call:', err);
    res.status(500).json({ error: 'Failed to generate call' });
  }
});

module.exports = router;
