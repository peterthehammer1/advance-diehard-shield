const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');

// GET all entries (optional ?type=whitelist or ?type=blacklist)
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM phone_lists ORDER BY created_at DESC';
    const params = [];

    if (type) {
      query = 'SELECT * FROM phone_lists WHERE list_type = $1 ORDER BY created_at DESC';
      params.push(type);
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching phone lists:', err);
    res.status(500).json({ error: 'Failed to fetch phone lists' });
  }
});

// POST add a number
router.post('/', async (req, res) => {
  try {
    const { phone_number, list_type, label, notes } = req.body;

    if (!phone_number || !list_type) {
      return res.status(400).json({ error: 'phone_number and list_type are required' });
    }

    if (!['whitelist', 'blacklist'].includes(list_type)) {
      return res.status(400).json({ error: 'list_type must be whitelist or blacklist' });
    }

    const { rows } = await pool.query(
      `INSERT INTO phone_lists (phone_number, list_type, label, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone_number) DO UPDATE SET list_type = $2, label = $3, notes = $4, created_at = NOW()
       RETURNING *`,
      [phone_number, list_type, label || null, notes || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error adding phone list entry:', err);
    res.status(500).json({ error: 'Failed to add entry' });
  }
});

// PUT update an entry
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { phone_number, list_type, label, notes } = req.body;

    const { rows } = await pool.query(
      `UPDATE phone_lists SET phone_number = COALESCE($2, phone_number),
       list_type = COALESCE($3, list_type), label = COALESCE($4, label),
       notes = COALESCE($5, notes) WHERE id = $1 RETURNING *`,
      [id, phone_number, list_type, label, notes]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating phone list entry:', err);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// DELETE remove an entry
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM phone_lists WHERE id = $1', [id]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting phone list entry:', err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

module.exports = router;
