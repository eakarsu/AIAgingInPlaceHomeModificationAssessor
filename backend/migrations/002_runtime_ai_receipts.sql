CREATE TABLE IF NOT EXISTS runtime_ai_provider_receipts (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider = 'openrouter'),
  provider_request_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 4000),
  content TEXT NOT NULL CHECK (length(content) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_request_id)
);
