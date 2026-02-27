const { pool } = require('../db/init');
const { classify } = require('./classifier');

const STORES = [
  'Store #1042 - Atlanta',
  'Store #2187 - Charlotte',
  'Store #0891 - Raleigh',
  'Store #3305 - Richmond',
  'Store #1576 - Durham'
];

let intervalId = null;
let callCount = 0;
let sseClients = null;

function setSseClients(clients) {
  sseClients = clients;
}

function isRunning() {
  return intervalId !== null;
}

function getStatus() {
  return { running: isRunning(), callCount };
}

async function generateCall(profileId) {
  // Load profile
  let profile;
  if (profileId) {
    const result = await pool.query('SELECT * FROM simulation_profiles WHERE id = $1', [profileId]);
    if (result.rows.length === 0) throw new Error('Profile not found');
    profile = result.rows[0];
  } else {
    // Pick random profile
    const result = await pool.query('SELECT * FROM simulation_profiles ORDER BY RANDOM() LIMIT 1');
    profile = result.rows[0];
  }

  // Generate call properties based on profile behavior
  const call = {
    from_number: profile.phone_number,
    to_store: pickStore(profile),
    duration_seconds: generateDuration(profile),
    passes_ivr: profile.passes_ivr
  };

  // For "mixed" behavior, add some randomness
  if (profile.behavior === 'mixed') {
    call.passes_ivr = Math.random() > 0.3; // 70% passes IVR
    call.duration_seconds = Math.random() > 0.4
      ? Math.floor(Math.random() * 40) + 10  // 60%: normal call (10-50s)
      : Math.floor(Math.random() * 4) + 1;   // 40%: short call (1-4s)
  }

  // Classify the call
  const result = await classify(call);

  // Insert into database
  const { rows } = await pool.query(
    `INSERT INTO calls (from_number, to_store, duration_seconds, classification, action, reason, is_simulated)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING *`,
    [call.from_number, call.to_store, call.duration_seconds, result.classification, result.action, result.reason]
  );

  const savedCall = rows[0];

  // Look up label for the phone number
  const labelResult = await pool.query(
    `SELECT label FROM phone_lists WHERE phone_number = $1
     UNION
     SELECT label FROM simulation_profiles WHERE phone_number = $1
     LIMIT 1`,
    [call.from_number]
  );
  savedCall.caller_label = labelResult.rows.length > 0 ? labelResult.rows[0].label : null;

  // Broadcast via SSE
  broadcast(savedCall);

  callCount++;
  return savedCall;
}

function pickStore(profile) {
  if (profile.targets_multiple_stores) {
    return STORES[Math.floor(Math.random() * STORES.length)];
  }
  // Mostly call the same store
  return Math.random() > 0.15 ? STORES[0] : STORES[Math.floor(Math.random() * STORES.length)];
}

function generateDuration(profile) {
  if (profile.behavior === 'robocaller') {
    // Very short: 0-4 seconds
    return Math.floor(Math.random() * 5);
  }
  // Normal variation around average
  const variance = Math.floor(profile.avg_duration_seconds * 0.4);
  return Math.max(1, profile.avg_duration_seconds + Math.floor(Math.random() * variance * 2) - variance);
}

function broadcast(callData) {
  if (!sseClients) return;
  const data = `data: ${JSON.stringify(callData)}\n\n`;
  for (const client of sseClients) {
    client.write(data);
  }
}

function start(intervalMs = 3000) {
  if (intervalId) return;
  intervalId = setInterval(async () => {
    try {
      await generateCall();
    } catch (err) {
      console.error('Simulation error:', err);
    }
  }, intervalMs);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { setSseClients, generateCall, start, stop, isRunning, getStatus };
