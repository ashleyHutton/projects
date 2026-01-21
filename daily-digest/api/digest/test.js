const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize clients
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Get user (for now, just get the first one - TODO: add auth)
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*, github_connections(*)')
      .limit(1);

    if (userError || !users?.length) {
      return res.status(400).json({ ok: false, error: 'No user found', details: userError });
    }

    const user = users[0];
    // github_connections can be an object (one-to-one) or array
    const githubConnection = Array.isArray(user.github_connections) 
      ? user.github_connections[0] 
      : user.github_connections;

    if (!githubConnection) {
      return res.status(400).json({ ok: false, error: 'No GitHub connection found', user: { id: user.id, email: user.email } });
    }

    // Fetch GitHub activity
    const githubActivity = await fetchGitHubActivity(githubConnection.access_token, githubConnection.github_username);

    // Generate AI summary
    const summary = await generateSummary(anthropic, githubActivity);

    // Send email
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Daily Digest <onboarding@resend.dev>',
      to: user.email,
      subject: `📬 Your Daily Digest — ${today}`,
      html: buildEmailHtml(summary, today),
    });

    if (emailError) {
      return res.status(500).json({ ok: false, error: 'Failed to send email', details: emailError });
    }

    res.json({ 
      ok: true, 
      message: `Test digest sent to ${user.email}`,
      emailId: emailData?.id,
      preview: summary.substring(0, 200) + '...'
    });

  } catch (err) {
    console.error('Test digest error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

async function fetchGitHubActivity(token, username) {
  try {
    // Get recent events
    const eventsRes = await fetch(`https://api.github.com/users/${username}/events?per_page=30`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    const events = await eventsRes.json();

    // Get notifications
    const notifRes = await fetch('https://api.github.com/notifications?per_page=10', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    const notifications = await notifRes.json();

    return {
      events: Array.isArray(events) ? events.slice(0, 20) : [],
      notifications: Array.isArray(notifications) ? notifications : [],
      username,
    };
  } catch (err) {
    console.error('GitHub fetch error:', err);
    return { events: [], notifications: [], username, error: err.message };
  }
}

async function generateSummary(anthropic, githubData) {
  const prompt = `You are creating a morning digest email. Summarize this GitHub activity into a brief, friendly email.

GitHub Activity for ${githubData.username}:
- Events: ${JSON.stringify(githubData.events.map(e => ({ type: e.type, repo: e.repo?.name, created: e.created_at })), null, 2)}
- Notifications: ${githubData.notifications.length} pending

Create a summary with these sections (use HTML):
1. <h2>🐙 GitHub Highlights</h2> - 3-5 bullet points of key activity
2. <h2>📋 Pending</h2> - Any notifications or items needing attention
3. <h2>💡 TL;DR</h2> - 1-2 sentence summary

Keep it concise, scannable, and friendly. Use <ul><li> for lists. If there's no activity, say it's been quiet.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

function buildEmailHtml(summary, date) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
          }
          h1 { color: #6366f1; margin-bottom: 5px; }
          h2 { color: #444; font-size: 1.1rem; margin-top: 25px; }
          .date { color: #888; margin-bottom: 20px; }
          ul { padding-left: 20px; }
          li { margin-bottom: 8px; }
          .footer { 
            margin-top: 30px; 
            padding-top: 20px; 
            border-top: 1px solid #eee; 
            color: #888; 
            font-size: 0.85rem; 
          }
          a { color: #6366f1; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📬 Daily Digest</h1>
          <p class="date">${date}</p>
          ${summary}
          <div class="footer">
            <p>You're receiving this because you subscribed to Daily Digest.</p>
            <p><a href="https://projects.ashleyweinaug.com/daily-digest/dashboard">Manage preferences</a></p>
          </div>
        </div>
      </body>
    </html>
  `;
}
