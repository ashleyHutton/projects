const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');

module.exports = async (req, res) => {
  // Verify cron secret (Vercel sends this header)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow manual triggers for testing without auth
    if (req.query.test !== 'true') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Get current hour in different timezones
    const now = new Date();
    const results = { sent: 0, skipped: 0, errors: [] };

    // Get all users with their settings and connections
    const { data: users, error } = await supabase
      .from('users')
      .select('*, github_connections(*), feeds(*), settings(*)');

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    for (const user of users || []) {
      try {
        const settings = Array.isArray(user.settings) ? user.settings[0] : user.settings;
        const githubConnection = Array.isArray(user.github_connections) 
          ? user.github_connections[0] 
          : user.github_connections;
        const feeds = Array.isArray(user.feeds) ? user.feeds : (user.feeds ? [user.feeds] : []);

        // Check if it's time to send for this user
        const userTimezone = settings?.timezone || 'America/Chicago';
        const deliveryHour = settings?.delivery_hour || 7;
        
        const userTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
        const currentHour = userTime.getHours();

        // Only send if it's the right hour (cron runs hourly at :00)
        if (currentHour !== deliveryHour) {
          results.skipped++;
          continue;
        }

        // Skip if no GitHub connection
        if (!githubConnection) {
          results.skipped++;
          continue;
        }

        // Fetch GitHub activity
        const githubActivity = await fetchGitHubActivity(
          githubConnection.access_token, 
          githubConnection.github_username
        );

        // Fetch RSS feeds
        const rssContent = await fetchRSSFeeds(feeds);

        // Generate AI summary
        const summary = await generateSummary(anthropic, githubActivity, rssContent);

        // Send email
        const today = new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        });

        await resend.emails.send({
          from: 'Daily Digest <onboarding@resend.dev>',
          to: user.email,
          subject: `📬 Your Daily Digest — ${today}`,
          html: buildEmailHtml(summary, today),
        });

        results.sent++;

      } catch (userError) {
        results.errors.push({ userId: user.id, error: userError.message });
      }
    }

    res.json({ ok: true, ...results });

  } catch (err) {
    console.error('Cron error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

async function fetchGitHubActivity(token, username) {
  try {
    const eventsRes = await fetch(`https://api.github.com/users/${username}/events?per_page=30`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    const events = await eventsRes.json();

    return {
      events: Array.isArray(events) ? events.slice(0, 20) : [],
      username,
    };
  } catch (err) {
    return { events: [], username, error: err.message };
  }
}

async function fetchRSSFeeds(feeds) {
  const Parser = require('rss-parser');
  const parser = new Parser();
  const results = [];

  for (const feed of feeds.slice(0, 5)) { // Limit to 5 feeds
    try {
      const parsed = await parser.parseURL(feed.url);
      const recentItems = parsed.items.slice(0, 5).map(item => ({
        title: item.title,
        link: item.link,
        date: item.pubDate,
      }));
      results.push({ source: parsed.title || feed.url, items: recentItems });
    } catch (err) {
      // Skip failed feeds
    }
  }

  return results;
}

async function generateSummary(anthropic, githubData, rssContent) {
  const prompt = `Create a morning digest email summarizing this activity. Be concise and friendly.

GitHub Activity for ${githubData.username}:
${JSON.stringify(githubData.events.slice(0, 10).map(e => ({ type: e.type, repo: e.repo?.name })), null, 2)}

RSS Feed Updates:
${JSON.stringify(rssContent, null, 2)}

Format with HTML sections:
1. <h2>🐙 GitHub Highlights</h2> - 3-5 bullet points
2. <h2>📰 From Your Feeds</h2> - Top stories (skip if no feeds)
3. <h2>💡 TL;DR</h2> - 1-2 sentence summary

Use <ul><li> for lists. Keep it scannable.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

function buildEmailHtml(summary, date) {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    .container { background: white; padding: 30px; border-radius: 10px; }
    h1 { color: #6366f1; margin-bottom: 5px; }
    h2 { color: #444; font-size: 1.1rem; margin-top: 25px; }
    .date { color: #888; margin-bottom: 20px; }
    ul { padding-left: 20px; }
    li { margin-bottom: 8px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 0.85rem; }
    a { color: #6366f1; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📬 Daily Digest</h1>
    <p class="date">${date}</p>
    ${summary}
    <div class="footer">
      <p><a href="https://projects.ashleyweinaug.com/daily-digest/dashboard">Manage preferences</a></p>
    </div>
  </div>
</body>
</html>`;
}
