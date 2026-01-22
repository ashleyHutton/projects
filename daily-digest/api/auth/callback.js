const { createClient } = require('@supabase/supabase-js');
const { getServiceClient } = require('../../lib/auth');

// OAuth callback handler - exchanges code for session
module.exports = async (req, res) => {
  const { code, error: oauthError } = req.query;

  if (oauthError) {
    console.error('OAuth error:', oauthError);
    return res.redirect('/daily-digest/dashboard?error=' + oauthError);
  }

  if (!code) {
    return res.redirect('/daily-digest/dashboard?error=no_code');
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Code exchange error:', error);
      return res.redirect('/daily-digest/dashboard?error=exchange_failed');
    }

    const { user, session } = data;

    // If this was a GitHub OAuth, save the GitHub token
    if (user.app_metadata?.provider === 'github') {
      await saveGitHubConnection(user);
    }

    // Build redirect with session info (frontend will store it)
    const params = new URLSearchParams({
      login: 'success',
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    });

    res.redirect(`/daily-digest/dashboard?${params}`);
    
  } catch (err) {
    console.error('Callback error:', err);
    res.redirect('/daily-digest/dashboard?error=callback_failed');
  }
};

// Save GitHub connection details for API access
async function saveGitHubConnection(user) {
  try {
    const serviceClient = getServiceClient();
    
    // Get the user's profile ID
    const { data: profile } = await serviceClient
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single();
    
    if (!profile) {
      console.error('No profile found for auth user:', user.id);
      return;
    }

    // Get GitHub username from user metadata
    const githubUsername = user.user_metadata?.user_name || 
                          user.user_metadata?.preferred_username ||
                          user.email?.split('@')[0];

    // Get provider token if available
    const providerToken = user.app_metadata?.provider_token;

    if (githubUsername) {
      await serviceClient
        .from('github_connections')
        .upsert({
          user_id: profile.id,
          github_username: githubUsername,
          access_token: providerToken || 'oauth-managed',
        }, { onConflict: 'user_id' });
    }
  } catch (err) {
    console.error('Failed to save GitHub connection:', err);
  }
}
