const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  const results = {
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL ? 'set (' + process.env.SUPABASE_URL.substring(0, 20) + '...)' : 'MISSING',
      SUPABASE_KEY: process.env.SUPABASE_KEY ? 'set (' + process.env.SUPABASE_KEY.substring(0, 15) + '...)' : 'MISSING',
    },
    tests: {}
  };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    return res.json(results);
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // Test 1: Read users
    const { data: users, error: readError } = await supabase.from('users').select('*').limit(5);
    results.tests.read = readError ? { error: readError } : { count: users.length, data: users };

    // Test 2: Write test user
    const testEmail = `test-${Date.now()}@example.com`;
    const { data: newUser, error: writeError } = await supabase
      .from('users')
      .insert({ email: testEmail })
      .select()
      .single();
    
    if (writeError) {
      results.tests.write = { error: writeError };
    } else {
      results.tests.write = { success: true, user: newUser };
      
      // Clean up - delete test user
      await supabase.from('users').delete().eq('id', newUser.id);
      results.tests.cleanup = { success: true };
    }

  } catch (err) {
    results.tests.exception = { message: err.message, stack: err.stack };
  }

  res.json(results);
};
