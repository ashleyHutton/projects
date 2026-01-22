const { clearAuthCookies } = require('../../lib/auth');

// Logout - clear session
module.exports = async (req, res) => {
  // Set headers to clear cookies
  const cookies = clearAuthCookies();
  res.setHeader('Set-Cookie', cookies);
  
  // If it's an API call, return JSON
  if (req.headers.accept?.includes('application/json')) {
    return res.json({ ok: true, message: 'Logged out' });
  }
  
  // Otherwise redirect to home
  res.redirect('/daily-digest/');
};
