const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');
const Parser = require('rss-parser');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);
const parser = new Parser();

module.exports = async (req, res) => {
  // Verify cron secret (Vercel sends this header)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // TODO: Fetch all users from database who should receive digest now
    const users = await getActiveUsers();

    for (const user of users) {
      await sendDigestToUser(user);
    }

    res.json({ ok: true, sent: users.length });
  } catch (err) {
    console.error('Cron error:', err);
    res.status(500).json({ error: 'Failed to send digests' });
  }
};

async function getActiveUsers() {
  // TODO: Query database for users with active subscriptions
  // For now, return empty array
  return [];
}

async function sendDigestToUser(user) {
  // 1. Fetch GitHub activity
  const githubData = await fetchGitHubActivity(user.githubToken);

  // 2. Fetch RSS feeds
  const rssData = await fetchRSSFeeds(user.feeds);

  // 3. Generate AI summary
  const summary = await generateSummary(githubData, rssData);

  // 4. Send email
  await sendEmail(user.email, summary);
}

async function fetchGitHubActivity(token) {
  if (!token) return null;

  try {
    const res = await fetch('https://api.github.com/users/me/events?per_page=50', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    return await res.json();
  } catch (err) {
    console.error('GitHub fetch error:', err);
    return null;
  }
}

async function fetchRSSFeeds(feeds) {
  if (!feeds || feeds.length === 0) return [];

  const results = [];
  for (const feedUrl of feeds) {
    try {
      const feed = await parser.parseURL(feedUrl);
      // Get last 10 items from past 24 hours
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;
      const recentItems = feed.items
        .filter(item => new Date(item.pubDate) > yesterday)
        .slice(0, 10);
      results.push({ source: feed.title, items: recentItems });
    } catch (err) {
      console.error(`RSS fetch error for ${feedUrl}:`, err);
    }
  }
  return results;
}

async function generateSummary(githubData, rssData) {
  const prompt = `You are creating a morning digest email. Summarize the following activity into a brief, scannable email format.

GitHub Activity:
${JSON.stringify(githubData, null, 2)}

RSS Feed Updates:
${JSON.stringify(rssData, null, 2)}

Format the response as HTML email content with sections for:
1. 🐙 GitHub Highlights (3-5 bullet points)
2. 📰 From Your Feeds (3-5 interesting items)
3. 💡 TL;DR (2-3 sentence summary)

Keep it concise and scannable. Use <strong> for emphasis.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

async function sendEmail(to, htmlContent) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  await resend.emails.send({
    from: 'Daily Digest <digest@yourdomain.com>',
    to,
    subject: `📬 Your Daily Digest — ${today}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            h1 { color: #6366f1; }
            h2 { color: #666; font-size: 1.1rem; margin-top: 1.5rem; }
            ul { padding-left: 1.5rem; }
            li { margin-bottom: 0.5rem; }
            .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #eee; color: #999; font-size: 0.85rem; }
          </style>
        </head>
        <body>
          <h1>📬 Daily Digest</h1>
          ${htmlContent}
          <div class="footer">
            <p>You're receiving this because you subscribed to Daily Digest.</p>
            <p><a href="${process.env.APP_URL}/dashboard">Manage preferences</a> | <a href="${process.env.APP_URL}/api/unsubscribe">Unsubscribe</a></p>
          </div>
        </body>
      </html>
    `,
  });
}
