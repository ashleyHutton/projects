const { createClient } = require('@supabase/supabase-js');

// Handle unsubscribe requests
module.exports = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(unsubscribePage('Missing unsubscribe token', false));
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // Find user by unsubscribe token
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, subscription_status')
      .eq('unsubscribe_token', token)
      .single();

    if (error || !user) {
      return res.status(404).send(unsubscribePage('Invalid or expired unsubscribe link', false));
    }

    if (req.method === 'POST') {
      // Actually unsubscribe - set status to 'unsubscribed'
      const { error: updateError } = await supabase
        .from('users')
        .update({ subscription_status: 'unsubscribed' })
        .eq('id', user.id);

      if (updateError) {
        return res.status(500).send(unsubscribePage('Failed to unsubscribe. Please try again.', false));
      }

      return res.send(unsubscribePage(`You've been unsubscribed. We're sorry to see you go!`, true, user.email));
    }

    // GET - show confirmation page
    res.send(unsubscribePage(
      `Are you sure you want to unsubscribe ${user.email} from Daily Digest?`,
      false,
      user.email,
      true // show confirm button
    ));

  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.status(500).send(unsubscribePage('Something went wrong. Please try again.', false));
  }
};

function unsubscribePage(message, success, email = '', showConfirm = false) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe — Daily Digest</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container {
      max-width: 400px;
      text-align: center;
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }
    p {
      color: #888;
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }
    .btn {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      border: none;
      margin: 0.25rem;
    }
    .btn-danger {
      background: #dc2626;
      color: white;
    }
    .btn-secondary {
      background: #333;
      color: #e5e5e5;
    }
    .btn:hover {
      opacity: 0.9;
    }
    .success { color: #22c55e; }
    .error { color: #ef4444; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${success ? '✅' : showConfirm ? '📬' : '❌'}</div>
    <h1>${success ? 'Unsubscribed' : showConfirm ? 'Unsubscribe' : 'Oops'}</h1>
    <p class="${success ? 'success' : ''}">${message}</p>
    ${showConfirm ? `
      <form method="POST">
        <button type="submit" class="btn btn-danger">Yes, Unsubscribe</button>
        <a href="/daily-digest/dashboard" class="btn btn-secondary">Cancel</a>
      </form>
    ` : success ? `
      <a href="/daily-digest/" class="btn btn-secondary">Back to Home</a>
    ` : `
      <a href="/daily-digest/" class="btn btn-secondary">Go Home</a>
    `}
  </div>
</body>
</html>`;
}
