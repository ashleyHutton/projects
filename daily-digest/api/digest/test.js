// Send a test digest to the current user
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // TODO: Get user from session, send them a test digest
  // For now, just return success
  res.json({ ok: true, message: 'Test digest would be sent here' });
};
