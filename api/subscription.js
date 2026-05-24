import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function getUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user;
}

export default async function handler(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('subscriptions').select('*')
      .eq('user_id', user.id).single();

    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });

    if (!data) {
      const { data: newSub, error: insertError } = await supabase
        .from('subscriptions')
        .insert({ user_id: user.id, plan_name: 'starter', status: 'active' })
        .select().single();
      if (insertError) return res.status(500).json({ error: insertError.message });
      return res.json(newSub);
    }
    return res.json(data);
  }

  if (req.method === 'POST') {
    const { plan_name } = req.body;
    const { data: existing } = await supabase
      .from('subscriptions').select('id').eq('user_id', user.id).single();

    const result = existing
      ? await supabase.from('subscriptions').update({ plan_name, status: 'active' }).eq('user_id', user.id).select().single()
      : await supabase.from('subscriptions').insert({ user_id: user.id, plan_name, status: 'active' }).select().single();

    if (result.error) return res.status(500).json({ error: result.error.message });
    return res.json(result.data);
  }
}