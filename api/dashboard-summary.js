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

  const [projectsRes, runsRes, subRes] = await Promise.all([
    supabase.from('projects').select('*').eq('user_id', user.id),
    supabase.from('ai_runs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
    supabase.from('subscriptions').select('plan_name').eq('user_id', user.id).single(),
  ]);

  const projects = projectsRes.data ?? [];
  const runs = runsRes.data ?? [];
  const totalRows = projects.reduce((sum, p) => sum + (p.row_count ?? 0), 0);
  const storageUsedMb = parseFloat((projects.length * 0.12).toFixed(2));

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const activityMap = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    activityMap[days[d.getDay()]] = 0;
  }
  runs.forEach(run => {
    const day = days[new Date(run.created_at).getDay()];
    if (day in activityMap) activityMap[day]++;
  });
  const recentActivity = Object.entries(activityMap).map(([label, value]) => ({ label, value }));

  const chartCounts = {};
  runs.forEach(run => {
    const key = (run.chart_recommendation ?? 'Bar').split(' ')[0];
    chartCounts[key] = (chartCounts[key] ?? 0) + 1;
  });
  const colors = ['#8b5cf6','#22c55e','#06b6d4','#f59e0b'];
  const total = Object.values(chartCounts).reduce((a, b) => a + b, 0) || 1;
  const chartMix = Object.entries(chartCounts).map(([name, count], i) => ({
    name, value: Math.round((count / total) * 100), color: colors[i % colors.length],
  }));

  const insights = [];
  if (projects.length === 0) insights.push('Upload your first dataset to get started.');
  else insights.push(`You have ${projects.length} project${projects.length > 1 ? 's' : ''} saved.`);
  if (runs.length >= 3) insights.push('Consider upgrading to Pro for unlimited AI runs.');
  if (totalRows > 500) insights.push(`${totalRows} rows analyzed — your data pipeline is active.`);
  if (insights.length === 0) insights.push('Run the AI assistant on a project to see insights here.');

  return res.json({
    totalProjects: projects.length,
    totalRows,
    activePlan: subRes.data?.plan_name ?? 'starter',
    aiRuns: runs.length,
    storageUsedMb,
    recentActivity,
    chartMix: chartMix.length ? chartMix : [{ name: 'Bar', value: 100, color: '#8b5cf6' }],
    insights,
  });
}