const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('../../lib/auth');

// Combined feeds endpoint: POST /api/feeds with action=add|remove
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await requireAuth(req);
    if (!auth) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const { action, url, id } = req.body;
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    if (action === 'remove') {
      if (!id) {
        return res.status(400).json({ ok: false, error: 'Feed ID is required' });
      }

      const { error } = await supabase
        .from('feeds')
        .delete()
        .eq('id', id)
        .eq('user_id', auth.userId);

      if (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }

      return res.json({ ok: true });

    } else {
      // Default: add
      if (!url) {
        return res.status(400).json({ ok: false, error: 'URL is required' });
      }

      const { data: feed, error } = await supabase
        .from('feeds')
        .insert({ user_id: auth.userId, url: url.trim() })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }

      return res.json({ ok: true, feed: { id: feed.id, url: feed.url } });
    }

  } catch (err) {
    console.error('Feeds error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};
