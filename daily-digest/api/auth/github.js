const { createClient } = require('@supabase/supabase-js');

// GitHub OAuth via Supabase - redirects to GitHub
module.exports = async (req, res) => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${process.env.APP_URL}/daily-digest/api/auth/callback`,
        scopes: 'read:user user:email repo',
      },
    });

    if (error) {
      console.error('GitHub OAuth error:', error);
      return res.redirect('/daily-digest/dashboard?error=oauth_init_failed');
    }

    res.redirect(data.url);
    
  } catch (err) {
    console.error('GitHub OAuth error:', err);
    res.redirect('/daily-digest/dashboard?error=oauth_failed');
  }
};
