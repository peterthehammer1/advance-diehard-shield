-- Phone lists: one whitelisted, one blacklisted
INSERT INTO phone_lists (phone_number, list_type, label, notes) VALUES
  ('+1-555-0101', 'whitelist', 'Alice Johnson (Customer)', 'Known legitimate customer'),
  ('+1-555-0199', 'blacklist', 'Robo Dialer 9000', 'Known spam robocaller')
ON CONFLICT (phone_number) DO NOTHING;

-- Classification rules with default thresholds
INSERT INTO classification_rules (rule_name, description, threshold_value, enabled) VALUES
  ('short_duration', 'Flag calls shorter than N seconds', 5, TRUE),
  ('high_frequency', 'Flag if more than N calls from same number in 1 hour', 3, TRUE),
  ('multi_store', 'Flag if calling more than N distinct stores in 1 hour', 2, TRUE),
  ('ivr_challenge_fail', 'Flag if caller fails IVR press-1 challenge', 1, TRUE)
ON CONFLICT (rule_name) DO NOTHING;

-- Simulation profiles: 3 demo personas
INSERT INTO simulation_profiles (phone_number, label, behavior, avg_duration_seconds, calls_per_hour, targets_multiple_stores, passes_ivr) VALUES
  ('+1-555-0101', 'Alice Johnson (Customer)', 'legitimate', 45, 1, FALSE, TRUE),
  ('+1-555-0199', 'Robo Dialer 9000', 'robocaller', 2, 10, TRUE, FALSE),
  ('+1-555-0150', 'Unknown Caller', 'mixed', 15, 3, FALSE, TRUE)
ON CONFLICT DO NOTHING;

-- Pre-seed historical calls so dashboard isn't empty
INSERT INTO calls (from_number, to_store, duration_seconds, classification, action, reason, is_simulated, created_at) VALUES
  ('+1-555-0199', 'Store #1042 - Atlanta', NULL, 'blacklisted', 'blocked', 'Number is blacklisted', TRUE, NOW() - INTERVAL '2 hours'),
  ('+1-555-0199', 'Store #2187 - Charlotte', NULL, 'blacklisted', 'blocked', 'Number is blacklisted', TRUE, NOW() - INTERVAL '1 hour 45 minutes'),
  ('+1-555-0199', 'Store #0891 - Raleigh', NULL, 'blacklisted', 'blocked', 'Number is blacklisted', TRUE, NOW() - INTERVAL '1 hour 30 minutes'),
  ('+1-555-0101', 'Store #1042 - Atlanta', 47, 'whitelisted', 'allowed', 'Number is whitelisted', TRUE, NOW() - INTERVAL '1 hour 20 minutes'),
  ('+1-555-0101', 'Store #1042 - Atlanta', 32, 'whitelisted', 'allowed', 'Number is whitelisted', TRUE, NOW() - INTERVAL '55 minutes'),
  ('+1-555-0150', 'Store #1042 - Atlanta', 3, 'spam_detected', 'blocked', 'Short duration (3s < 5s threshold), High call frequency (4 calls/hr)', TRUE, NOW() - INTERVAL '50 minutes'),
  ('+1-555-0150', 'Store #2187 - Charlotte', 2, 'spam_detected', 'blocked', 'Short duration (2s < 5s threshold), Multi-store calling (3 stores/hr)', TRUE, NOW() - INTERVAL '45 minutes'),
  ('+1-555-0150', 'Store #1042 - Atlanta', 22, 'legitimate', 'allowed', 'No spam indicators detected', TRUE, NOW() - INTERVAL '30 minutes'),
  ('+1-555-0150', 'Store #0891 - Raleigh', 8, 'unknown', 'allowed', 'Suspicious but insufficient evidence: High call frequency (4 calls/hr)', TRUE, NOW() - INTERVAL '15 minutes'),
  ('+1-555-0101', 'Store #0891 - Raleigh', 61, 'whitelisted', 'allowed', 'Number is whitelisted', TRUE, NOW() - INTERVAL '5 minutes');
