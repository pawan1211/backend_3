const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header.' });
    }

    const token = header.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    req.user = {
      supabaseId: user.id,
      email: user.email,
      role: user.user_metadata?.role || 'client',
    };

    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    res.status(500).json({ error: 'Authentication error.' });
  }
};

const requireRole = (roles) => (req, res, next) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions.' });
  }
  next();
};

module.exports = { requireAuth, requireRole, supabase };
