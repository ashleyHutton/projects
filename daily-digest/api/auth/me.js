const { requireAuth } = require('../../lib/auth');

// Get current authenticated user
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await requireAuth(req);
    
    if (!auth || !auth.profile) {
      return res.status(401).json({ authenticated: false, user: null });
    }

    const profile = auth.profile;

    // Clean up response
    const response = {
      authenticated: true,
      user: {
        id: profile.id,
        authId: auth.authId,
        email: profile.email,
        subscriptionStatus: profile.subscription_status,
        createdAt: profile.created_at,
        github: profile.github_connections?.[0] ? {
          username: profile.github_connections[0].github_username,
          connected: true,
        } : null,
        settings: profile.settings?.[0] || profile.settings || null,
        feeds: profile.feeds || [],
      },
    };

    res.json(response);
    
  } catch (err) {
    console.error('Auth check error:', err);
    res.status(500).json({ authenticated: false, error: err.message });
  }
};
