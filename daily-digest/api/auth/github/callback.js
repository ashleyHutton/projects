// GitHub OAuth - Step 2: Handle callback
module.exports = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect('/daily-digest/dashboard?error=no_code');
  }

  try {
    // Check env vars first
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      return res.redirect('/daily-digest/dashboard?error=missing_github_env');
    }

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
      return res.redirect('/daily-digest/dashboard?error=oauth_failed&reason=' + tokenData.error);
    }

    // Get user info from GitHub
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const githubUser = await userRes.json();

    // Check Supabase env vars
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      // No database configured, just show success
      return res.redirect('/daily-digest/dashboard?github=connected&user=' + githubUser.login + '&reason=no_supabase_env');
    }

    // Try to save to database
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // Get user's email from GitHub
    const emailRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    const emails = await emailRes.json();
    const primaryEmail = Array.isArray(emails) ? (emails.find(e => e.primary)?.email || emails[0]?.email) : null;

    if (!primaryEmail) {
      return res.redirect('/daily-digest/dashboard?github=connected&user=' + githubUser.login + '&note=no_email&emails_response=' + encodeURIComponent(JSON.stringify(emails).substring(0, 100)));
    }

    // Create or get user in our database
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', primaryEmail)
      .single();

    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({ email: primaryEmail })
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating user:', createError);
        return res.redirect('/daily-digest/dashboard?github=connected&user=' + githubUser.login + '&db_error=create');
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
      return res.redirect('/daily-digest/dashboard?github=connected&user=' + githubUser.login + '&db_error=github');
    }

    // Success!
    res.redirect('/daily-digest/dashboard?github=connected&user=' + user.id + '&db=success&email=' + encodeURIComponent(primaryEmail));
  } catch (err) {
    console.error('GitHub callback error:', err);
    res.redirect('/daily-digest/dashboard?error=callback_failed&msg=' + encodeURIComponent(err.message));
  }
};
