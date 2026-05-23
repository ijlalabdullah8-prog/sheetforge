import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { supabase } from './supabase.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();
app.use(cors());
app.use(express.json());

// ─── PROJECTS ────────────────────────────────────────────────────────────────

app.get('/api/projects', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post('/api/projects', authMiddleware, async (req, res) => {
  const { name, description, source_type, file_name, storage_path, dataset_preview } = req.body;
  const rows = Array.isArray(dataset_preview) ? dataset_preview : [];
  const row_count = rows.length;
  const column_count = rows[0] ? Object.keys(rows[0]).length : 0;

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: req.user.id,
      name, description, source_type, file_name, storage_path,
      row_count, column_count,
      dataset_preview: rows,
      transformed_preview: rows,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ─── AI RUNS ─────────────────────────────────────────────────────────────────

app.get('/api/ai-runs', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('ai_runs')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post('/api/ai-runs', authMiddleware, async (req, res) => {
  const { project_id, prompt } = req.body;

  const { data: project, error: projectError } = await supabase
    .from('projects').select('*')
    .eq('id', project_id).eq('user_id', req.user.id).single();

  if (projectError || !project) return res.status(404).json({ error: 'Project not found' });

  let response_summary = 'AI transformation completed successfully.';
  let chart_recommendation = 'Bar chart by category';
  let action_type = 'transform';
  let transformed_preview = project.transformed_preview;

  try {
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a data analyst AI. Given this dataset and prompt, respond ONLY with a JSON object — no markdown, no explanation outside JSON.

JSON format:
{
  "action_type": "transform",
  "response_summary": "2-3 sentence description of what you did",
  "chart_recommendation": "e.g. Bar chart by channel",
  "transformed_preview": [array of max 10 row objects]
}

Dataset: ${JSON.stringify(project.dataset_preview)}

Prompt: ${prompt}`
            }]
          }],
          generationConfig: { temperature: 0.2 }
        }),
      }
    );

    const aiData = await aiRes.json();
    const raw = aiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    action_type = parsed.action_type ?? action_type;
    response_summary = parsed.response_summary ?? response_summary;
    chart_recommendation = parsed.chart_recommendation ?? chart_recommendation;
    transformed_preview = parsed.transformed_preview ?? transformed_preview;
  } catch (err) {
    console.error('Gemini AI call failed:', err.message);
  }

  const { data: run, error: runError } = await supabase
    .from('ai_runs')
    .insert({ user_id: req.user.id, project_id, prompt, action_type, response_summary, chart_recommendation })
    .select().single();

  if (runError) return res.status(500).json({ error: runError.message });

  await supabase.from('projects')
    .update({ transformed_preview, updated_at: new Date().toISOString() })
    .eq('id', project_id);

  res.json(run);
});

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

app.get('/api/exports', authMiddleware, async (req, res) => {
  const { project_id, format } = req.query;

  const { data: project, error } = await supabase
    .from('projects').select('*')
    .eq('id', project_id).eq('user_id', req.user.id).single();

  if (error || !project) return res.status(404).json({ error: 'Project not found' });

  const rows = project.transformed_preview ?? project.dataset_preview ?? [];
  if (!rows.length) return res.status(400).json({ error: 'No data to export' });

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
  ];

  res.json({
    download: csvLines.join('\n'),
    fileName: `${project.name.toLowerCase().replace(/\s+/g, '-')}.${format ?? 'csv'}`,
  });
});

// ─── SUBSCRIPTION ────────────────────────────────────────────────────────────

app.get('/api/subscription', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('subscriptions').select('*')
    .eq('user_id', req.user.id).single();

  if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });

  if (!data) {
    const { data: newSub, error: insertError } = await supabase
      .from('subscriptions')
      .insert({ user_id: req.user.id, plan_name: 'starter', status: 'active' })
      .select().single();
    if (insertError) return res.status(500).json({ error: insertError.message });
    return res.json(newSub);
  }
  res.json(data);
});

app.post('/api/subscription', authMiddleware, async (req, res) => {
  const { plan_name } = req.body;
  const { data: existing } = await supabase
    .from('subscriptions').select('id').eq('user_id', req.user.id).single();

  const result = existing
    ? await supabase.from('subscriptions').update({ plan_name, status: 'active' }).eq('user_id', req.user.id).select().single()
    : await supabase.from('subscriptions').insert({ user_id: req.user.id, plan_name, status: 'active' }).select().single();

  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json(result.data);
});

// ─── DASHBOARD SUMMARY ───────────────────────────────────────────────────────

app.get('/api/dashboard-summary', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  const [projectsRes, runsRes, subRes] = await Promise.all([
    supabase.from('projects').select('*').eq('user_id', userId),
    supabase.from('ai_runs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
    supabase.from('subscriptions').select('plan_name').eq('user_id', userId).single(),
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
  if (runs.length >= 3) insights.push('Great usage! Consider upgrading to Pro for unlimited AI runs.');
  if (totalRows > 500) insights.push(`${totalRows} rows analyzed — your data pipeline is active.`);
  if (insights.length === 0) insights.push('Run the AI assistant on a project to see insights here.');

  res.json({
    totalProjects: projects.length,
    totalRows,
    activePlan: subRes.data?.plan_name ?? 'starter',
    aiRuns: runs.length,
    storageUsedMb,
    recentActivity,
    chartMix: chartMix.length ? chartMix : [{ name: 'Bar', value: 100, color: '#8b5cf6' }],
    insights,
  });
});

// ─── START ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));