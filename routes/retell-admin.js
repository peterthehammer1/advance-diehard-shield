const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');
const retell = require('../services/retell');

const TRANSFER_TOOL = {
  type: 'transfer_call',
  name: 'transfer_to_store',
  description: 'Transfer the caller to the store location. Use when the caller asks to speak with someone at the store, asks to be connected or transferred, or when you cannot answer their question.',
  transfer_destination: { type: 'phone_number', number: '{{store_transfer_number}}' },
  transfer_option: { type: 'cold_transfer', show_transferee_as_caller: true },
  speak_during_execution: true,
  execution_message_description: 'Tell the caller you are connecting them to the store now.'
};

const END_CALL_TOOL = {
  type: 'end_call',
  name: 'end_call',
  description: 'End the call'
};

const BASE_PROMPT = `You are a helpful assistant for Advance Auto Parts, {{store_name}} location.
Store address: {{store_address}}
Store hours: {{store_hours}}

Always answer the phone with exactly: "Thank you for calling Advance Auto. How may I help you?"

You can answer questions about the store such as hours of operation, location, and directions.
You can also help with general automotive parts questions.
Keep responses conversational, friendly, and concise.`;

const AGENT_CONFIGS = [
  {
    name: 'Store Assistant',
    agent_type: 'assistant',
    prompt: BASE_PROMPT + `

The caller is a verified customer.
If the caller asks to speak with someone at the store, to be connected, or transferred, immediately say "Let me connect you to the store" and use the transfer_to_store tool.
If you cannot answer a question, say "Let me connect you to someone at the store who can help" and use the transfer_to_store tool.
Do not give long explanations before transferring — just connect them quickly.`,
    voice_id: '11labs-Adrian',
    tools: [TRANSFER_TOOL]
  },
  {
    name: 'Call Blocked',
    agent_type: 'blocked',
    prompt: BASE_PROMPT + `

IMPORTANT: You must NEVER transfer or connect this caller to a live agent or the store under any circumstances.
If the caller asks to speak with someone, be connected, or transferred, say:
"I apologize, but your phone number has been identified as potential spam and cannot be connected to a live agent. If you believe this is in error, please email us at shield@diespam.com and we will review your number."
If you cannot answer a question, do your best with the information available but do NOT offer to connect them to anyone.`,
    voice_id: '11labs-Adrian',
    tools: [END_CALL_TOOL]
  },
  {
    name: 'Call Screener',
    agent_type: 'screening',
    prompt: BASE_PROMPT + `

This caller's number is not yet recognized. Pay attention to whether they are a real person or an automated call.

If the caller engages in real conversation — asks a question, states a reason for calling, or responds naturally to you — they are likely human. If they ask to be connected to the store or you cannot answer their question, say "Let me connect you to the store" and use the transfer_to_store tool.

If the caller does not engage meaningfully — prolonged silence, incoherent responses, a recorded message playing over you, or they cannot answer a simple question — politely say: "I'm sorry, I'm unable to assist you at this time. Goodbye." and use the end_call tool.

Do not give long explanations before transferring — just connect them quickly when appropriate.`,
    voice_id: '11labs-Adrian',
    tools: [TRANSFER_TOOL, END_CALL_TOOL]
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
        webhook_url: `${webhookUrl}/webhook/retell-call-ended`,
        tools: config.tools
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

// POST /api/retell/update-agents — update existing agent prompts and tools in place
router.post('/update-agents', async (req, res) => {
  try {
    const results = [];

    for (const config of AGENT_CONFIGS) {
      const existing = await pool.query(
        'SELECT * FROM retell_agents WHERE agent_type = $1',
        [config.agent_type]
      );

      if (existing.rows.length === 0) {
        results.push({ agent_type: config.agent_type, status: 'not_found' });
        continue;
      }

      const { retell_llm_id } = existing.rows[0];
      if (!retell_llm_id) {
        results.push({ agent_type: config.agent_type, status: 'no_llm_id' });
        continue;
      }

      await retell.updateLlm(retell_llm_id, {
        prompt: config.prompt,
        tools: config.tools || []
      });

      results.push({ agent_type: config.agent_type, status: 'updated', llm_id: retell_llm_id });
    }

    res.json({ updated: results });
  } catch (err) {
    console.error('Retell update-agents error:', err);
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
