const { createClient } = require('@supabase/supabase-js');

// Server-side Supabase client (service role for admin ops)
function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

// Client with user's session (for RLS-protected queries)
function getClientWithAuth(accessToken) {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    }
  );
}

/**
 * Parse Supabase auth tokens from cookies
 */
function parseAuthCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.split('=');
    if (name && rest.length) {
      cookies[name.trim()] = rest.join('=').trim();
    }
  });
  
  return cookies;
}

/**
 * Get session from request - checks Supabase auth cookies/headers
 */
async function getSession(req) {
  // Check for Authorization header first (API calls)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return verifyToken(token);
  }
  
  // Check cookies (browser requests)
  const cookies = parseAuthCookies(req.headers.cookie || '');
  
  // Supabase stores tokens in sb-<ref>-auth-token cookie
  const authCookie = Object.entries(cookies).find(([key]) => 
    key.includes('auth-token')
  );
  
  if (authCookie) {
    try {
      const tokenData = JSON.parse(decodeURIComponent(authCookie[1]));
      if (tokenData?.access_token) {
        return verifyToken(tokenData.access_token);
      }
    } catch (e) {
      // Cookie parse failed
    }
  }
  
  return null;
}

/**
 * Verify a Supabase access token
 */
async function verifyToken(accessToken) {
  try {
    const supabase = getServiceClient();
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (error || !user) {
      return null;
    }
    
    return {
      authId: user.id,
      email: user.email,
      accessToken,
    };
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return null;
  }
}

/**
 * Get full user profile from public.users table
 */
async function getUserProfile(authId) {
  const supabase = getServiceClient();
  
  const { data: user, error } = await supabase
    .from('users')
    .select('*, github_connections(*), settings(*), feeds(*)')
    .eq('auth_id', authId)
    .single();
  
  if (error || !user) {
    return null;
  }
  
  return user;
}

/**
 * Middleware-style auth check - returns session or null
 */
async function requireAuth(req) {
  const session = await getSession(req);
  if (!session) {
    return null;
  }
  
  // Get the user's profile from public.users
  const profile = await getUserProfile(session.authId);
  
  return {
    authId: session.authId,
    email: session.email,
    userId: profile?.id,
    profile,
    accessToken: session.accessToken,
  };
}

/**
 * Create Set-Cookie headers to clear auth
 */
function clearAuthCookies() {
  // Clear potential Supabase auth cookies
  return [
    'sb-access-token=; Path=/; Max-Age=0',
    'sb-refresh-token=; Path=/; Max-Age=0',
  ];
}

module.exports = {
  getServiceClient,
  getClientWithAuth,
  getSession,
  verifyToken,
  getUserProfile,
  requireAuth,
  clearAuthCookies,
  parseAuthCookies,
};
