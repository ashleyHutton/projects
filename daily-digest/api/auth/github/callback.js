// GitHub OAuth - Step 2: Handle callback
module.exports = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect('/dashboard?error=no_code');
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
      return res.redirect('/dashboard?error=oauth_failed');
    }

    // Get user info
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const user = await userRes.json();

    // TODO: Store token in database, create session
    console.log('GitHub user connected:', user.login);

    // For now, just redirect back to dashboard
    // In production, set a session cookie
    res.redirect('/dashboard?github=connected');
  } catch (err) {
    console.error('GitHub callback error:', err);
    res.redirect('/dashboard?error=callback_failed');
  }
};
