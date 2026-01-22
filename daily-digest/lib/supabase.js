const { createClient } = require('@supabase/supabase-js');

// Service client (bypasses RLS, for server-side ops)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = { supabase };
