-- Daily Digest Database Schema

-- Users table (linked to Stripe)
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT UNIQUE,
  subscription_status TEXT DEFAULT NULL,  -- null until user subscribes via Stripe
  unsubscribe_token UUID DEFAULT gen_random_uuid(),
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GitHub connections
CREATE TABLE github_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  github_username TEXT NOT NULL,
  access_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RSS feeds per user
CREATE TABLE feeds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User settings
CREATE TABLE settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  delivery_hour INT DEFAULT 7,
  timezone TEXT DEFAULT 'America/Chicago',
  summary_length TEXT DEFAULT 'normal',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Digest history
CREATE TABLE digest_history (
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

-- Indexes for performance
CREATE INDEX idx_github_connections_user ON github_connections(user_id);
CREATE INDEX idx_feeds_user ON feeds(user_id);
CREATE INDEX idx_settings_user ON settings(user_id);
CREATE INDEX idx_digest_history_user ON digest_history(user_id);
CREATE INDEX idx_digest_history_sent_at ON digest_history(sent_at DESC);
