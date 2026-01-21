const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Feed ID is required' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    const { error } = await supabase
      .from('feeds')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    res.json({ ok: true });

  } catch (err) {
    console.error('Remove feed error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};
