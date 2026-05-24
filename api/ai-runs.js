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
      .from('ai_runs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data ?? []);
  }

  if (req.method === 'POST') {
    const { project_id, prompt } = req.body;

    const { data: project, error: projectError } = await supabase
      .from('projects').select('*')
      .eq('id', project_id).eq('user_id', user.id).single();

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
  "response_summary": "2-3 sentence description",
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
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      action_type = parsed.action_type ?? action_type;
      response_summary = parsed.response_summary ?? response_summary;
      chart_recommendation = parsed.chart_recommendation ?? chart_recommendation;
      transformed_preview = parsed.transformed_preview ?? transformed_preview;
    } catch (err) {
      console.error('Gemini failed:', err.message);
    }

    const { data: run, error: runError } = await supabase
      .from('ai_runs')
      .insert({ user_id: user.id, project_id, prompt, action_type, response_summary, chart_recommendation })
      .select().single();

    if (runError) return res.status(500).json({ error: runError.message });

    await supabase.from('projects')
      .update({ transformed_preview, updated_at: new Date().toISOString() })
      .eq('id', project_id);

    return res.json(run);
  }
}