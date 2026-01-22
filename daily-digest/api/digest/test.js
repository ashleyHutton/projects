const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('../../lib/auth');
const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');
const Parser = require('rss-parser');

const rssParser = new Parser();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await requireAuth(req);
    if (!auth) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    // Initialize clients
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Get authenticated user's data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*, github_connections(*), feeds(*)')
      .eq('id', auth.userId)
      .single();

    if (userError || !user) {
      return res.status(400).json({ ok: false, error: 'User not found', details: userError });
    }
    // github_connections can be an object (one-to-one) or array
    const githubConnection = Array.isArray(user.github_connections) 
      ? user.github_connections[0] 
      : user.github_connections;

    // Get user's RSS feeds
    const userFeeds = Array.isArray(user.feeds) ? user.feeds : [];

    let githubActivity = { events: [], notifications: [], username: null };
    if (githubConnection) {
      // Fetch GitHub activity
      githubActivity = await fetchGitHubActivity(githubConnection.access_token, githubConnection.github_username);
    }

    // Fetch RSS feed content
    const rssContent = await fetchRSSFeeds(userFeeds);

    // Generate AI summary
    const summary = await generateSummary(anthropic, githubActivity, rssContent);

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
      feedsIncluded: rssContent.length,
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

async function fetchRSSFeeds(feeds) {
  const results = [];
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const feed of feeds) {
    try {
      const parsed = await rssParser.parseURL(feed.url);
      
      // Get recent items (last 24 hours)
      const recentItems = (parsed.items || [])
        .filter(item => {
          const pubDate = item.pubDate ? new Date(item.pubDate) : null;
          return !pubDate || pubDate > oneDayAgo;
        })
        .slice(0, 5) // Max 5 items per feed
        .map(item => ({
          title: item.title,
          link: item.link,
          pubDate: item.pubDate,
          snippet: item.contentSnippet?.substring(0, 200) || item.content?.substring(0, 200) || '',
        }));

      if (recentItems.length > 0) {
        results.push({
          feedTitle: parsed.title || feed.title || feed.url,
          feedUrl: feed.url,
          items: recentItems,
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
  if (githubData.username) {
    prompt += `## GitHub Activity for ${githubData.username}:
- Events: ${JSON.stringify(githubData.events.map(e => ({ type: e.type, repo: e.repo?.name, created: e.created_at })), null, 2)}
- Notifications: ${githubData.notifications.length} pending

`;
  }

  // Add RSS feeds section if available
  if (rssFeeds.length > 0) {
    prompt += `## RSS Feed Updates:
${rssFeeds.map(feed => `
### ${feed.feedTitle}
${feed.items.map(item => `- "${item.title}" - ${item.snippet}`).join('\n')}
`).join('\n')}

`;
  }

  prompt += `Create a summary with these sections (use HTML):
1. ${githubData.username ? '<h2>🐙 GitHub Highlights</h2> - 3-5 bullet points of key activity' : ''}
${rssFeeds.length > 0 ? '2. <h2>📰 News & Reads</h2> - Key highlights from RSS feeds with links' : ''}
3. <h2>📋 Pending</h2> - Any notifications or items needing attention
4. <h2>💡 TL;DR</h2> - 1-2 sentence summary of everything

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
