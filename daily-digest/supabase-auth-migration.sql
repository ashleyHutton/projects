-- Supabase Auth Migration
-- Run this in Supabase SQL Editor

-- 1. Add auth_id column to link with Supabase Auth
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

-- 3. Function to auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (auth_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (email) DO UPDATE SET auth_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Enable RLS on all tables (if not already)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies - users can only see/edit their own data
-- Users table
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth_id = auth.uid());

-- GitHub connections
DROP POLICY IF EXISTS "Users can manage own github" ON github_connections;
CREATE POLICY "Users can manage own github" ON github_connections
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Feeds
DROP POLICY IF EXISTS "Users can manage own feeds" ON feeds;
CREATE POLICY "Users can manage own feeds" ON feeds
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Settings
DROP POLICY IF EXISTS "Users can manage own settings" ON settings;
CREATE POLICY "Users can manage own settings" ON settings
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- 7. Service role bypass (for cron jobs, webhooks)
-- Note: Service role key already bypasses RLS by default
