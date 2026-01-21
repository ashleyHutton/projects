const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ ok: false, error: 'URL is required' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // Get first user (TODO: add auth)
    const { data: users } = await supabase.from('users').select('id').limit(1);
    if (!users?.length) {
      return res.status(400).json({ ok: false, error: 'No user found' });
    }

    const userId = users[0].id;

    // Add the feed
    const { data: feed, error } = await supabase
      .from('feeds')
      .insert({ user_id: userId, url: url.trim() })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    res.json({ ok: true, feed: { id: feed.id, url: feed.url } });

  } catch (err) {
    console.error('Add feed error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};
