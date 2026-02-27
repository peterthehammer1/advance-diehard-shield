const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');
const retell = require('../services/retell');

const AGENT_CONFIGS = [
  {
    name: 'Store Assistant',
    agent_type: 'assistant',
    prompt: `You are a helpful store assistant for Advance Auto Parts {{store_name}} location.
The caller is {{caller_name}}, a verified customer.
Greet them warmly by name and ask how you can help.
Be friendly, professional, and helpful with any automotive parts questions.
Keep responses conversational and concise.`,
    voice_id: '11labs-Adrian'
  },
  {
    name: 'Call Blocked',
    agent_type: 'blocked',
    prompt: `Say exactly this message, then end the call:
"This number has been identified as a suspected spam call and will not be connected. If you believe this is an error, please contact us through our website. Goodbye."
After saying this message, immediately end the call. Do not engage in further conversation.`,
    voice_id: '11labs-Adrian',
    end_call_after_silence_ms: 10000
  },
  {
    name: 'Call Screener',
    agent_type: 'screening',
    prompt: `You are a call screener for Advance Auto Parts {{store_name}} location.
Politely ask the caller to identify themselves and state the purpose of their call.
Say something like: "Thank you for calling Advance Auto Parts. May I ask who's calling and how I can direct your call?"
If they provide a legitimate business reason, say: "Thank you, let me connect you now."
If they seem like a robocall, don't respond coherently, or can't answer basic questions, politely say: "I'm sorry, I'm unable to connect your call at this time. Goodbye."
Keep responses brief and professional.`,
    voice_id: '11labs-Adrian'
  }
];

const STORE_NUMBERS = [
  { area_code: 470, nickname: 'Store #1042 - Atlanta', store_name: 'Atlanta' },
  { area_code: 980, nickname: 'Store #2187 - Charlotte', store_name: 'Charlotte' },
  { area_code: 984, nickname: 'Store #0891 - Raleigh', store_name: 'Raleigh' }
];

// POST /api/retell/setup — create agents and phone numbers
router.post('/setup', async (req, res) => {
  try {
    const webhookUrl = process.env.WEBHOOK_BASE_URL;
    if (!webhookUrl) {
      return res.status(400).json({ error: 'WEBHOOK_BASE_URL environment variable is not set' });
    }

    const results = { agents: [], phone_numbers: [] };

    // Create agents
    for (const config of AGENT_CONFIGS) {
      // Check if already exists in our DB
      const existing = await pool.query(
        'SELECT * FROM retell_agents WHERE agent_type = $1',
        [config.agent_type]
      );

      if (existing.rows.length > 0) {
        results.agents.push({ ...existing.rows[0], status: 'already_exists' });
        continue;
      }

      const { agent, llm } = await retell.createAgent({
        name: config.name,
        prompt: config.prompt,
        voice_id: config.voice_id,
        end_call_after_silence_ms: config.end_call_after_silence_ms,
        webhook_url: `${webhookUrl}/webhook/retell-call-ended`
      });

      const { rows } = await pool.query(
        `INSERT INTO retell_agents (name, agent_type, retell_agent_id, retell_llm_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [config.name, config.agent_type, agent.agent_id, llm.llm_id]
      );

      results.agents.push({ ...rows[0], status: 'created' });
    }

    // Get the assistant agent ID for default assignment
    const assistantResult = await pool.query(
      "SELECT retell_agent_id FROM retell_agents WHERE agent_type = 'assistant'"
    );
    const defaultAgentId = assistantResult.rows[0]?.retell_agent_id;

    if (!defaultAgentId) {
      return res.status(500).json({ error: 'Failed to find assistant agent' });
    }

    // Create phone numbers
    for (const store of STORE_NUMBERS) {
      const existing = await pool.query(
        'SELECT * FROM retell_phone_numbers WHERE store_name = $1',
        [store.store_name]
      );

      if (existing.rows.length > 0) {
        results.phone_numbers.push({ ...existing.rows[0], status: 'already_exists' });
        continue;
      }

      const number = await retell.createPhoneNumber({
        area_code: store.area_code,
        agent_id: defaultAgentId,
        nickname: store.nickname,
        webhook_url: `${webhookUrl}/webhook/retell-inbound`
      });

      const { rows } = await pool.query(
        `INSERT INTO retell_phone_numbers (phone_number, nickname, store_name, retell_number_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [number.phone_number, store.nickname, store.store_name, number.phone_number]
      );

      results.phone_numbers.push({ ...rows[0], status: 'created' });
    }

    res.json(results);
  } catch (err) {
    console.error('Retell setup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/retell/status — current agents and phone numbers
router.get('/status', async (req, res) => {
  try {
    const agents = await pool.query('SELECT * FROM retell_agents ORDER BY created_at');
    const numbers = await pool.query('SELECT * FROM retell_phone_numbers ORDER BY created_at');

    res.json({
      agents: agents.rows,
      phone_numbers: numbers.rows,
      webhook_base_url: process.env.WEBHOOK_BASE_URL || null,
      retell_api_key_set: !!process.env.RETELL_API_KEY
    });
  } catch (err) {
    console.error('Retell status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/retell/teardown — remove all agents and phone numbers
router.delete('/teardown', async (req, res) => {
  try {
    const results = { deleted_numbers: 0, deleted_agents: 0, errors: [] };

    // Delete phone numbers first
    const numbers = await pool.query('SELECT * FROM retell_phone_numbers');
    for (const num of numbers.rows) {
      try {
        await retell.deletePhoneNumber(num.retell_number_id);
        results.deleted_numbers++;
      } catch (err) {
        results.errors.push(`Failed to delete number ${num.phone_number}: ${err.message}`);
      }
    }
    await pool.query('DELETE FROM retell_phone_numbers');

    // Delete agents and their LLMs
    const agents = await pool.query('SELECT * FROM retell_agents');
    for (const agent of agents.rows) {
      try {
        await retell.deleteAgent(agent.retell_agent_id);
        if (agent.retell_llm_id) {
          await retell.deleteLlm(agent.retell_llm_id);
        }
        results.deleted_agents++;
      } catch (err) {
        results.errors.push(`Failed to delete agent ${agent.name}: ${err.message}`);
      }
    }
    await pool.query('DELETE FROM retell_agents');

    res.json(results);
  } catch (err) {
    console.error('Retell teardown error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
