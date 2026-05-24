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
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data ?? []);
  }

  if (req.method === 'POST') {
    const { name, description, source_type, file_name, storage_path, dataset_preview } = req.body;
    const rows = Array.isArray(dataset_preview) ? dataset_preview : [];
    const row_count = rows.length;
    const column_count = rows[0] ? Object.keys(rows[0]).length : 0;

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        name, description, source_type, file_name, storage_path,
        row_count, column_count,
        dataset_preview: rows,
        transformed_preview: rows,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
}