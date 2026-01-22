const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('../../lib/auth');

module.exports = async (req, res) => {
  try {
    const auth = await requireAuth(req);
    
    if (!auth) {
      return res.json({ 
        ok: false, 
        authenticated: false,
        error: 'Not authenticated' 
      });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Get user with connections and settings
    const { data: user, error } = await supabase
      .from('users')
      .select('*, github_connections(*), feeds(*), settings(*)')
      .eq('id', auth.userId)
      .single();

    if (error || !user) {
      return res.json({ ok: false, error: 'User not found' });
    }
    
    // Handle both object and array responses from Supabase
    const githubConnection = Array.isArray(user.github_connections) 
      ? user.github_connections[0] 
      : user.github_connections;
    
    const settings = Array.isArray(user.settings)
      ? user.settings[0]
      : user.settings;

    const feeds = Array.isArray(user.feeds) ? user.feeds : (user.feeds ? [user.feeds] : []);

    res.json({
      ok: true,
      authenticated: true,
      user: {
        id: user.id,
        authId: auth.authId,
        email: user.email,
        subscriptionStatus: user.subscription_status,
      },
      github: githubConnection ? {
        connected: true,
        username: githubConnection.github_username,
      } : {
        connected: false,
      },
      feeds: feeds.map(f => ({ id: f.id, url: f.url, title: f.title })),
      settings: settings ? {
        deliveryHour: settings.delivery_hour,
        timezone: settings.timezone,
        summaryLength: settings.summary_length,
      } : {
        deliveryHour: 7,
        timezone: 'America/Chicago',
        summaryLength: 'normal',
      },
    });

  } catch (err) {
    console.error('User state error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};
