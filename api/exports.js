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

  const { project_id, format } = req.query;

  const { data: project, error } = await supabase
    .from('projects').select('*')
    .eq('id', project_id).eq('user_id', user.id).single();

  if (error || !project) return res.status(404).json({ error: 'Project not found' });

  const rows = project.transformed_preview ?? project.dataset_preview ?? [];
  if (!rows.length) return res.status(400).json({ error: 'No data to export' });

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
  ];

  return res.json({
    download: csvLines.join('\n'),
    fileName: `${project.name.toLowerCase().replace(/\s+/g, '-')}.${format ?? 'csv'}`,
  });
}