// GitHub OAuth - Step 1: Redirect to GitHub
module.exports = async (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = `${process.env.APP_URL}/api/auth/github/callback`;
  const scope = 'read:user user:email repo';

  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

  res.redirect(authUrl);
};
