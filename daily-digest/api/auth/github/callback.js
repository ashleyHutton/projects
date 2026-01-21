const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client directly
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// GitHub OAuth - Step 2: Handle callback
module.exports = async (req, res) => {
  // Debug: Check env vars
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('Missing Supabase env vars');
    return res.redirect('/daily-digest/dashboard?error=config_error');
  }
  const { code } = req.query;

  if (!code) {
    return res.redirect('/daily-digest/dashboard?error=no_code');
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('GitHub OAuth error:', tokenData);
      return res.redirect('/daily-digest/dashboard?error=oauth_failed');
    }

    // Get user info from GitHub
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const githubUser = await userRes.json();

    // Get user's email from GitHub
    const emailRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    const emails = await emailRes.json();
    const primaryEmail = emails.find(e => e.primary)?.email || emails[0]?.email;

    // Create or get user in our database
    let { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', primaryEmail)
      .single();

    if (!user) {
      // Create new user
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({ email: primaryEmail })
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating user:', createError);
        return res.redirect('/daily-digest/dashboard?error=db_error');
      }
      user = newUser;
    }

    // Upsert GitHub connection
    const { error: ghError } = await supabase
      .from('github_connections')
      .upsert({
        user_id: user.id,
        github_username: githubUser.login,
        access_token: tokenData.access_token,
      }, { onConflict: 'user_id' });

    if (ghError) {
      console.error('Error saving GitHub connection:', ghError);
      return res.redirect('/daily-digest/dashboard?error=db_error');
    }

    // Create default settings if they don't exist
    await supabase
      .from('settings')
      .upsert({
        user_id: user.id,
      }, { onConflict: 'user_id' });

    console.log('GitHub connected for:', githubUser.login);

    // Redirect back to dashboard with success
    // In production, you'd set a session cookie here
    res.redirect(`/daily-digest/dashboard?github=connected&user=${user.id}`);
  } catch (err) {
    console.error('GitHub callback error:', err);
    res.redirect('/daily-digest/dashboard?error=callback_failed');
  }
};
