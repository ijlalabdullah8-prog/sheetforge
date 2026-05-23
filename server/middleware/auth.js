import { supabase } from '../supabase.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'No auth token provided' });

    const token = header.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Invalid token' });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Auth middleware crashed' });
  }
};