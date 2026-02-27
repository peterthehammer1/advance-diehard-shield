const RETELL_BASE_URL = 'https://api.retellai.com';

function getApiKey() {
  const key = process.env.RETELL_API_KEY;
  if (!key) throw new Error('RETELL_API_KEY environment variable is not set');
  return key;
}

async function retellFetch(path, options = {}) {
  const res = await fetch(`${RETELL_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Retell API ${options.method || 'GET'} ${path} failed (${res.status}): ${body}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// --- Agents ---

async function createAgent({ name, prompt, voice_id, end_call_after_silence_ms, webhook_url, tools }) {
  // First create an LLM with the prompt
  const llm = await retellFetch('/create-retell-llm', {
    method: 'POST',
    body: JSON.stringify({
      general_prompt: prompt,
      general_tools: tools || []
    })
  });

  // Then create the agent with that LLM
  const agent = await retellFetch('/create-agent', {
    method: 'POST',
    body: JSON.stringify({
      response_engine: {
        type: 'retell-llm',
        llm_id: llm.llm_id
      },
      agent_name: name,
      voice_id: voice_id || '11labs-Adrian',
      voice_speed: 1.0,
      end_call_after_silence_ms: end_call_after_silence_ms || 600000,
      webhook_url: webhook_url || null
    })
  });

  return { agent, llm };
}

async function getAgent(agentId) {
  return retellFetch(`/get-agent/${agentId}`);
}

async function listAgents() {
  return retellFetch('/list-agents');
}

async function deleteAgent(agentId) {
  return retellFetch(`/delete-agent/${agentId}`, { method: 'DELETE' });
}

async function deleteLlm(llmId) {
  return retellFetch(`/delete-retell-llm/${llmId}`, { method: 'DELETE' });
}

async function updateLlm(llmId, { prompt, tools }) {
  return retellFetch(`/update-retell-llm/${llmId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      general_prompt: prompt,
      general_tools: tools || []
    })
  });
}

// --- Phone Numbers ---

async function createPhoneNumber({ area_code, agent_id, nickname, webhook_url }) {
  return retellFetch('/create-phone-number', {
    method: 'POST',
    body: JSON.stringify({
      area_code: parseInt(area_code),
      inbound_agent_id: agent_id,
      nickname: nickname || null,
      inbound_webhook_url: webhook_url || null
    })
  });
}

async function listPhoneNumbers() {
  return retellFetch('/list-phone-numbers');
}

async function deletePhoneNumber(phoneNumber) {
  return retellFetch(`/delete-phone-number/${encodeURIComponent(phoneNumber)}`, {
    method: 'DELETE'
  });
}

// --- Phone Number Normalization ---

// Strips all non-digit characters, returns digits only (e.g. "12016374059")
function toDigits(phone) {
  return phone.replace(/\D/g, '');
}

// Convert any format to E.164: +12016374059
function toE164(phone) {
  const digits = toDigits(phone);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

// Convert any format to our DB format: +1-201-637-4059
function toFormatted(phone) {
  const digits = toDigits(phone);
  let d = digits;
  if (d.length === 10) d = '1' + d;
  if (d.length === 11 && d.startsWith('1')) {
    return `+${d[0]}-${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  }
  return `+${d}`;
}

module.exports = {
  createAgent,
  getAgent,
  listAgents,
  deleteAgent,
  deleteLlm,
  updateLlm,
  createPhoneNumber,
  listPhoneNumbers,
  deletePhoneNumber,
  toDigits,
  toE164,
  toFormatted
};
