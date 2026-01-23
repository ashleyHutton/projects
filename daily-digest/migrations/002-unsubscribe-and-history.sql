-- Migration: Add unsubscribe token and digest history

-- Add unsubscribe token to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS unsubscribe_token UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unsubscribe_token ON users(unsubscribe_token);

-- Digest history table
CREATE TABLE IF NOT EXISTS digest_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  subject TEXT,
  github_events_count INT DEFAULT 0,
  rss_items_count INT DEFAULT 0,
  status TEXT DEFAULT 'sent',  -- sent, failed
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_digest_history_user ON digest_history(user_id);
CREATE INDEX IF NOT EXISTS idx_digest_history_sent_at ON digest_history(sent_at DESC);
