const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');
const { toFormatted, toDigits } = require('../services/retell');

// POST /webhook/retell-inbound — called by Retell when an inbound call arrives
router.post('/retell-inbound', async (req, res) => {
  try {
    console.log('Retell inbound webhook:', JSON.stringify(req.body));

    const { event, call_inbound } = req.body;

    if (event !== 'call_inbound' || !call_inbound) {
      return res.status(400).json({ error: 'Invalid webhook event' });
    }

    const { from_number, to_number, agent_id } = call_inbound;

    // Normalize the caller's number to match our DB format
    const formattedFrom = toFormatted(from_number);
    const fromDigits = toDigits(from_number);

    // Look up caller in phone_lists (try both formatted and digits-based match)
    const listResult = await pool.query(
      `SELECT list_type, label FROM phone_lists
       WHERE REPLACE(REPLACE(REPLACE(phone_number, '-', ''), '+', ''), ' ', '') = $1`,
      [fromDigits]
    );

    let callerStatus = 'unknown';
    let callerLabel = null;
    let overrideAgentId = null;

    if (listResult.rows.length > 0) {
      const entry = listResult.rows[0];
      callerStatus = entry.list_type === 'whitelist' ? 'whitelisted' : 'blacklisted';
      callerLabel = entry.label;
    }

    // Look up the store name from our retell_phone_numbers table
    const storeResult = await pool.query(
      `SELECT store_name, nickname FROM retell_phone_numbers
       WHERE REPLACE(REPLACE(REPLACE(phone_number, '-', ''), '+', ''), ' ', '') = $1`,
      [toDigits(to_number)]
    );
    const storeName = storeResult.rows.length > 0
      ? storeResult.rows[0].store_name
      : 'Advance Auto Parts';

    // Pick the right agent based on caller status
    const agentResult = await pool.query(
      'SELECT retell_agent_id FROM retell_agents WHERE agent_type = $1',
      [callerStatus === 'blacklisted' ? 'blocked' : callerStatus === 'whitelisted' ? 'assistant' : 'screening']
    );

    if (agentResult.rows.length > 0) {
      overrideAgentId = agentResult.rows[0].retell_agent_id;
    }

    // Determine classification and action
    const classification = callerStatus === 'whitelisted' ? 'whitelisted'
      : callerStatus === 'blacklisted' ? 'blacklisted'
      : 'unknown';
    const action = callerStatus === 'blacklisted' ? 'blocked' : 'allowed';
    const reason = callerStatus === 'whitelisted' ? 'Number is whitelisted'
      : callerStatus === 'blacklisted' ? 'Number is blacklisted'
      : 'Unknown caller — routed to screening';

    // Log the call
    const callInsert = await pool.query(
      `INSERT INTO calls (from_number, to_store, classification, action, reason, is_simulated)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       RETURNING *`,
      [formattedFrom, storeName, classification, action, reason]
    );

    const savedCall = callInsert.rows[0];
    savedCall.caller_label = callerLabel;

    // Broadcast to dashboard via SSE
    const sseClients = req.app.get('sseClients');
    if (sseClients) {
      const data = `data: ${JSON.stringify(savedCall)}\n\n`;
      for (const client of sseClients) {
        client.write(data);
      }
    }

    console.log(`Call from ${formattedFrom} (${callerStatus}) → ${storeName} → agent override: ${overrideAgentId || 'default'}`);

    // Respond to Retell with agent override and dynamic variables
    const response = {
      call_inbound: {
        dynamic_variables: {
          caller_name: callerLabel || 'Caller',
          caller_status: callerStatus,
          store_name: storeName
        }
      }
    };

    if (overrideAgentId) {
      response.call_inbound.override_agent_id = overrideAgentId;
    }

    res.json(response);
  } catch (err) {
    console.error('Retell webhook error:', err);
    // Return 200 anyway so Retell doesn't retry — log the error
    res.json({ call_inbound: {} });
  }
});

module.exports = router;
