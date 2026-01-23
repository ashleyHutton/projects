const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');
const Parser = require('rss-parser');

const rssParser = new Parser();

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
        // Only send to active or trialing subscribers
        const subStatus = user.subscription_status;
        if (subStatus !== 'active' && subStatus !== 'trialing') {
          results.skipped++;
          continue;
        }

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
        const currentDay = userTime.getDay(); // 0 = Sunday, 6 = Saturday

        // Skip weekends
        if (currentDay === 0 || currentDay === 6) {
          results.skipped++;
          continue;
        }

        // Only send if it's the right hour (cron runs hourly at :00)
        if (currentHour !== deliveryHour) {
          results.skipped++;
          continue;
        }

        // Fetch GitHub activity (optional now)
        let githubActivity = { events: [], notifications: [], username: null };
        if (githubConnection) {
          githubActivity = await fetchGitHubActivity(
            githubConnection.access_token, 
            githubConnection.github_username
          );
        }

        // Fetch RSS feeds
        const rssContent = await fetchRSSFeeds(feeds);

        // Skip if no content at all
        if (!githubConnection && rssContent.length === 0) {
          results.skipped++;
          continue;
        }

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

async function fetchRSSFeeds(feeds) {
  const results = [];
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const feed of feeds.slice(0, 10)) { // Limit to 10 feeds
    try {
      const parsed = await rssParser.parseURL(feed.url);
      
      // Get recent items (last 24 hours, or latest 3 if no dates)
      let recentItems = (parsed.items || [])
        .filter(item => {
          const pubDate = item.pubDate ? new Date(item.pubDate) : null;
          return !pubDate || pubDate > oneDayAgo;
        })
        .slice(0, 5);

      // If filtering by date gave us nothing, just take the latest few
      if (recentItems.length === 0 && parsed.items?.length > 0) {
        recentItems = parsed.items.slice(0, 3);
      }

      const mappedItems = recentItems.map(item => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        snippet: (item.contentSnippet || item.content || '').substring(0, 150),
      }));

      if (mappedItems.length > 0) {
        results.push({
          feedTitle: parsed.title || feed.title || feed.url,
          feedUrl: feed.url,
          items: mappedItems,
        });
      }
    } catch (err) {
      console.error(`Error fetching RSS feed ${feed.url}:`, err.message);
      // Continue with other feeds
    }
  }

  return results;
}

async function generateSummary(anthropic, githubData, rssFeeds) {
  let prompt = `You are creating a morning digest email. Summarize the following content into a brief, friendly email.

`;

  // Add GitHub section if available
  if (githubData.username && githubData.events.length > 0) {
    prompt += `## GitHub Activity for ${githubData.username}:
- Events: ${JSON.stringify(githubData.events.map(e => ({ type: e.type, repo: e.repo?.name, created: e.created_at })), null, 2)}
- Notifications: ${githubData.notifications?.length || 0} pending

`;
  }

  // Add RSS feeds section if available
  if (rssFeeds.length > 0) {
    prompt += `## RSS Feed Updates:
${rssFeeds.map(feed => `
### ${feed.feedTitle}
${feed.items.map(item => `- "${item.title}" ${item.snippet ? `- ${item.snippet}` : ''} (${item.link})`).join('\n')}
`).join('\n')}

`;
  }

  // Build the sections dynamically based on what content we have
  const sections = [];
  if (githubData.username && githubData.events.length > 0) {
    sections.push('<h2>🐙 GitHub Highlights</h2> - 3-5 bullet points of key activity');
  }
  if (rssFeeds.length > 0) {
    sections.push('<h2>📰 News & Reads</h2> - Key highlights from RSS feeds with clickable links');
  }
  sections.push('<h2>💡 TL;DR</h2> - 1-2 sentence summary of everything');

  prompt += `Create a summary with these sections (use HTML):
${sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Keep it concise, scannable, and friendly. Use <ul><li> for lists. Include links using <a href="url">title</a> format for RSS items.
If there's no activity in a section, skip that section entirely.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

function buildEmailHtml(summary, date) {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
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
      <p>You're receiving this because you subscribed to Daily Digest.</p>
      <p><a href="https://projects.ashleyweinaug.com/daily-digest/dashboard">Manage preferences</a></p>
    </div>
  </div>
</body>
</html>`;
}
