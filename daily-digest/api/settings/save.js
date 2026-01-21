const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { deliveryHour, timezone, summaryLength } = req.body;

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // Get first user (TODO: add auth)
    const { data: users } = await supabase.from('users').select('id').limit(1);
    if (!users?.length) {
      return res.status(400).json({ ok: false, error: 'No user found' });
    }

    const userId = users[0].id;

    // Upsert settings
    const { error } = await supabase
      .from('settings')
      .upsert({
        user_id: userId,
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
