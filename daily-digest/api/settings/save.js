const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('../../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await requireAuth(req);
    if (!auth) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const { deliveryHour, timezone, summaryLength } = req.body;

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Upsert settings for authenticated user
    const { error } = await supabase
      .from('settings')
      .upsert({
        user_id: auth.userId,
        delivery_hour: deliveryHour,
        timezone: timezone,
        summary_length: summaryLength,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    res.json({ ok: true });

  } catch (err) {
    console.error('Save settings error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};
