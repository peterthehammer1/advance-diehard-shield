const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');

// GET paginated call log
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const classification = req.query.classification || null;

    let query = 'SELECT * FROM calls';
    let countQuery = 'SELECT COUNT(*) FROM calls';
    const params = [];
    const countParams = [];

    if (classification) {
      query += ' WHERE classification = $1';
      countQuery += ' WHERE classification = $1';
      params.push(classification);
      countParams.push(classification);
    }

    query += ' ORDER BY created_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [dataResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
    ]);

    res.json({
      calls: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    });
  } catch (err) {
    console.error('Error fetching calls:', err);
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

// GET aggregate metrics
router.get('/metrics', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE action = 'blocked') AS blocked,
        COUNT(*) FILTER (WHERE action = 'allowed') AS allowed,
        COUNT(*) FILTER (WHERE flagged_false_positive = TRUE) AS false_positives,
        COUNT(*) FILTER (WHERE flagged_false_negative = TRUE) AS false_negatives,
        COUNT(*) FILTER (WHERE classification = 'blacklisted') AS blacklisted,
        COUNT(*) FILTER (WHERE classification = 'whitelisted') AS whitelisted,
        COUNT(*) FILTER (WHERE classification = 'spam_detected') AS spam_detected,
        COUNT(*) FILTER (WHERE classification = 'legitimate') AS legitimate,
        COUNT(*) FILTER (WHERE classification = 'unknown') AS unknown
      FROM calls
    `);

    const m = result.rows[0];
    const total = parseInt(m.total);

    res.json({
      total,
      blocked: parseInt(m.blocked),
      allowed: parseInt(m.allowed),
      blocked_pct: total > 0 ? ((parseInt(m.blocked) / total) * 100).toFixed(1) : '0.0',
      allowed_pct: total > 0 ? ((parseInt(m.allowed) / total) * 100).toFixed(1) : '0.0',
      false_positives: parseInt(m.false_positives),
      false_negatives: parseInt(m.false_negatives),
      by_classification: {
        blacklisted: parseInt(m.blacklisted),
        whitelisted: parseInt(m.whitelisted),
        spam_detected: parseInt(m.spam_detected),
        legitimate: parseInt(m.legitimate),
        unknown: parseInt(m.unknown)
      }
    });
  } catch (err) {
    console.error('Error fetching metrics:', err);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET SSE stream for real-time call events
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Send initial keepalive
  res.write(':\n\n');

  const sseClients = req.app.get('sseClients');
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// PATCH flag a call as false positive/negative
router.patch('/:id/flag', async (req, res) => {
  try {
    const { id } = req.params;
    const { false_positive, false_negative } = req.body;

    const updates = [];
    const params = [id];
    let paramIdx = 2;

    if (false_positive !== undefined) {
      updates.push(`flagged_false_positive = $${paramIdx++}`);
      params.push(false_positive);
    }
    if (false_negative !== undefined) {
      updates.push(`flagged_false_negative = $${paramIdx++}`);
      params.push(false_negative);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No flag values provided' });
    }

    updates.push('reviewed = TRUE');

    const { rows } = await pool.query(
      `UPDATE calls SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error flagging call:', err);
    res.status(500).json({ error: 'Failed to flag call' });
  }
});

// GET classification rules
router.get('/rules', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM classification_rules ORDER BY rule_name');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching rules:', err);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// PUT update a classification rule
router.put('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { threshold_value, enabled } = req.body;

    const { rows } = await pool.query(
      `UPDATE classification_rules
       SET threshold_value = COALESCE($2, threshold_value),
           enabled = COALESCE($3, enabled),
           updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, threshold_value, enabled]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating rule:', err);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

module.exports = router;
