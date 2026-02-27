CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS phone_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) NOT NULL,
  list_type VARCHAR(10) NOT NULL CHECK (list_type IN ('whitelist', 'blacklist')),
  label VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone_number)
);

CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_number VARCHAR(20) NOT NULL,
  to_store VARCHAR(100) DEFAULT 'Main Store',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER,
  classification VARCHAR(20) NOT NULL CHECK (classification IN (
    'blacklisted', 'whitelisted', 'spam_detected', 'legitimate', 'unknown'
  )),
  action VARCHAR(10) NOT NULL CHECK (action IN ('blocked', 'allowed')),
  reason TEXT,
  is_simulated BOOLEAN DEFAULT TRUE,
  flagged_false_positive BOOLEAN DEFAULT FALSE,
  flagged_false_negative BOOLEAN DEFAULT FALSE,
  reviewed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_from_number ON calls(from_number);
CREATE INDEX IF NOT EXISTS idx_calls_classification ON calls(classification);

CREATE TABLE IF NOT EXISTS classification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  threshold_value NUMERIC,
  enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS simulation_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) NOT NULL,
  label VARCHAR(100) NOT NULL,
  behavior VARCHAR(20) NOT NULL CHECK (behavior IN (
    'legitimate', 'robocaller', 'mixed'
  )),
  avg_duration_seconds INTEGER DEFAULT 30,
  calls_per_hour INTEGER DEFAULT 1,
  targets_multiple_stores BOOLEAN DEFAULT FALSE,
  passes_ivr BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retell_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  agent_type VARCHAR(20) NOT NULL CHECK (agent_type IN ('assistant', 'blocked', 'screening')),
  retell_agent_id VARCHAR(100) NOT NULL,
  retell_llm_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retell_phone_numbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) NOT NULL,
  nickname VARCHAR(100),
  store_name VARCHAR(100),
  retell_number_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
