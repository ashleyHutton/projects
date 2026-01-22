const { createClient } = require('@supabase/supabase-js');

// Combined auth endpoint: POST /api/auth with action=signup|signin
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    if (action === 'resend') {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.json({ ok: true, message: 'Confirmation email sent!' });
    }

    if (action === 'signup') {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${process.env.APP_URL}/daily-digest/dashboard`,
        },
      });

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      if (data.user && !data.session) {
        return res.json({
          ok: true,
          message: 'Check your email to confirm your account',
          needsConfirmation: true,
        });
      }

      return res.json({
        ok: true,
        user: { id: data.user.id, email: data.user.email },
        session: data.session ? {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at,
        } : null,
      });

    } else {
      // Default: signin
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return res.status(401).json({ error: error.message });
      }

      return res.json({
        ok: true,
        user: { id: data.user.id, email: data.user.email },
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at,
        },
      });
    }

  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
};
