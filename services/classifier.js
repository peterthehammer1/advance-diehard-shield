const { pool } = require('../db/init');

async function classify(call) {
  // Step 1: Check phone lists
  const listResult = await pool.query(
    'SELECT list_type, label FROM phone_lists WHERE phone_number = $1',
    [call.from_number]
  );

  if (listResult.rows.length > 0) {
    const entry = listResult.rows[0];
    if (entry.list_type === 'blacklist') {
      return {
        classification: 'blacklisted',
        action: 'blocked',
        reason: 'Number is blacklisted'
      };
    }
    if (entry.list_type === 'whitelist') {
      return {
        classification: 'whitelisted',
        action: 'allowed',
        reason: 'Number is whitelisted'
      };
    }
  }

  // Step 2: Load enabled classification rules
  const rulesResult = await pool.query(
    'SELECT rule_name, threshold_value FROM classification_rules WHERE enabled = TRUE'
  );
  const rules = {};
  for (const row of rulesResult.rows) {
    rules[row.rule_name] = parseFloat(row.threshold_value);
  }

  const flags = [];

  // Check short duration
  if (rules.short_duration != null && call.duration_seconds != null) {
    if (call.duration_seconds < rules.short_duration) {
      flags.push(`Short duration (${call.duration_seconds}s < ${rules.short_duration}s threshold)`);
    }
  }

  // Check high frequency (calls from same number in last hour)
  if (rules.high_frequency != null) {
    const freqResult = await pool.query(
      `SELECT COUNT(*) FROM calls
       WHERE from_number = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [call.from_number]
    );
    const count = parseInt(freqResult.rows[0].count);
    if (count >= rules.high_frequency) {
      flags.push(`High call frequency (${count + 1} calls/hr)`);
    }
  }

  // Check multi-store calling (distinct stores in last hour)
  if (rules.multi_store != null) {
    const storeResult = await pool.query(
      `SELECT COUNT(DISTINCT to_store) FROM calls
       WHERE from_number = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [call.from_number]
    );
    const storeCount = parseInt(storeResult.rows[0].count);
    // Include the current call's store
    const effectiveCount = call.to_store ? storeCount + 1 : storeCount;
    if (effectiveCount > rules.multi_store) {
      flags.push(`Multi-store calling (${effectiveCount} stores/hr)`);
    }
  }

  // Check IVR challenge
  if (rules.ivr_challenge_fail != null && call.passes_ivr === false) {
    flags.push('Failed IVR press-1 challenge');
  }

  // Step 3: Determine classification based on flag count
  if (flags.length >= 2) {
    return {
      classification: 'spam_detected',
      action: 'blocked',
      reason: flags.join(', ')
    };
  }

  if (flags.length === 1) {
    return {
      classification: 'unknown',
      action: 'allowed',
      reason: `Suspicious but insufficient evidence: ${flags[0]}`
    };
  }

  return {
    classification: 'legitimate',
    action: 'allowed',
    reason: 'No spam indicators detected'
  };
}

module.exports = { classify };
