import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  BrainCircuit,
  ChevronRight,
  CreditCard,
  Database,
  Download,
  FileSpreadsheet,
  FolderKanban,
  Loader2,
  LogOut,
  Mail,
  MoonStar,
  Shield,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { BarChart, Bar, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import supabase from './lib/supabase';
import { handleGoogleRedirect, signInWithGoogle } from './lib/googleAuth';

handleGoogleRedirect();

type User = { id: string; email?: string };

type Project = {
  id: number;
  user_id: string;
  name: string;
  description: string | null;
  source_type: string;
  file_name: string | null;
  storage_path: string | null;
  row_count: number;
  column_count: number;
  dataset_preview: DatasetRow[];
  transformed_preview: DatasetRow[];
  created_at: string;
  updated_at: string;
};

type DatasetRow = Record<string, string | number | null>;

type AiRun = {
  id: number;
  user_id: string;
  project_id: number;
  prompt: string;
  action_type: string;
  response_summary: string;
  chart_recommendation: string;
  created_at: string;
};

type Subscription = {
  id: number;
  plan_name: string;
  status: string;
  renewal_date: string | null;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
};

type DashboardSummary = {
  totalProjects: number;
  totalRows: number;
  activePlan: string;
  aiRuns: number;
  storageUsedMb: number;
  recentActivity: Array<{ label: string; value: number }>;
  chartMix: Array<{ name: string; value: number; color: string }>;
  insights: string[];
};

const plans = [
  { key: 'starter', name: 'Starter', price: '$0', features: ['3 projects', 'Basic AI transforms', 'CSV export'] },
  { key: 'pro', name: 'Pro', price: '$24', features: ['Unlimited projects', 'XLSX export', 'Advanced AI commands'] },
  { key: 'scale', name: 'Scale', price: '$79', features: ['Team-ready architecture', 'Priority queues', 'Webhook support'] },
];

const chartPalette = ['#8b5cf6', '#22c55e', '#06b6d4', '#f59e0b'];

const sampleUpload = `Month,Channel,Revenue,Customers,Region\nJan,Organic,12500,140,North America\nJan,Paid,18200,120,Europe\nFeb,Organic,15400,165,North America\nFeb,Partners,9800,75,APAC\nMar,Paid,22400,155,Europe\nMar,Organic,17100,180,North America`;

function parseCsv(text: string): DatasetRow[] {
  const rows = text.trim().split(/\r?\n/);
  if (!rows.length) return [];
  const headers = rows[0].split(',').map((item) => item.trim());
  return rows.slice(1).map((row) => {
    const values = row.split(',');
    return headers.reduce<DatasetRow>((acc, header, index) => {
      const raw = values[index]?.trim() ?? '';
      const numeric = Number(raw);
      acc[header] = raw !== '' && !Number.isNaN(numeric) ? numeric : raw;
      return acc;
    }, {});
  });
}

function App() {
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(true);

  const [projects, setProjects] = useState<Project[]>([]);
  const [runs, setRuns] = useState<AiRun[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [projectForm, setProjectForm] = useState({
    name: 'Q1 Revenue Operations',
    description: 'Cross-channel revenue and customer performance dataset',
    source_type: 'csv',
  });
  const [uploadText, setUploadText] = useState(sampleUpload);
  const [assistantPrompt, setAssistantPrompt] = useState('Clean missing values, summarize revenue by channel, and recommend the best chart.');

  useEffect(() => {
    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSessionUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      setAuthLoading(false);
    };
    loadSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const fetchDashboard = async () => {
    if (!sessionUser) return;
    setLoadingDashboard(true);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [projectsRes, runsRes, subscriptionRes, summaryRes] = await Promise.all([
        fetch('/api/projects', { headers }),
        fetch('/api/ai-runs', { headers }),
        fetch('/api/subscription', { headers }),
        fetch('/api/dashboard-summary', { headers }),
      ]);
      const [projectsData, runsData, subscriptionData, summaryData] = await Promise.all([
        projectsRes.json(),
        runsRes.json(),
        subscriptionRes.json(),
        summaryRes.json(),
      ]);
      setProjects(projectsData);
      setRuns(runsData);
      setSubscription(subscriptionData);
      setSummary(summaryData);
      if (!selectedProjectId && projectsData[0]?.id) setSelectedProjectId(projectsData[0].id);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoadingDashboard(false);
    }
  };

  useEffect(() => {
    if (sessionUser) fetchDashboard();
    else {
      setProjects([]);
      setRuns([]);
      setSummary(null);
      setSubscription(null);
      setLoadingDashboard(false);
    }
  }, [sessionUser]);

  const handleEmailAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError('');
    const action = authMode === 'signup'
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password });
    const { error } = await action;
    if (error) setAuthError(error.message);
  };

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingKey('project');
    try {
      const dataset = parseCsv(uploadText);
      const token = await getToken();
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...projectForm,
          file_name: `${projectForm.name.toLowerCase().replace(/\s+/g, '-')}.csv`,
          storage_path: `projects/${sessionUser?.id}/${Date.now()}.csv`,
          dataset_preview: dataset,
        }),
      });
      if (res.ok) {
        await fetchDashboard();
      }
    } finally {
      setSavingKey(null);
    }
  };

  const runAssistant = async () => {
    if (!selectedProjectId) return;
    setSavingKey('assistant');
    try {
      const token = await getToken();
      const res = await fetch('/api/ai-runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ project_id: selectedProjectId, prompt: assistantPrompt }),
      });
      if (res.ok) await fetchDashboard();
    } finally {
      setSavingKey(null);
    }
  };

  const exportProject = async (projectId: number, format: 'csv' | 'xlsx') => {
    setSavingKey(`export-${format}`);
    try {
      const token = await getToken();
      const res = await fetch(`/api/exports?project_id=${projectId}&format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.download) {
        const blob = new Blob([data.download], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setSavingKey(null);
    }
  };

  const choosePlan = async (plan_name: string) => {
    if (plan_name === 'starter') {
      setSavingKey('plan-starter');
      try {
        const token = await getToken();
        const res = await fetch('/api/subscription', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ plan_name }),
        });
        if (res.ok) await fetchDashboard();
      } finally {
        setSavingKey(null);
      }
      return;
    }

    // For pro and scale — open Lemon Squeezy checkout
    setSavingKey(`plan-${plan_name}`);
    try {
      const token = await getToken();
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan_name, email: sessionUser?.email }),
      });
      const data = await res.json();
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } finally {
      setSavingKey(null);
    }
  };

  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) || projects[0], [projects, selectedProjectId]);
  const latestRun = useMemo(() => runs.find((run) => run.project_id === selectedProject?.id), [runs, selectedProject]);

  const chartData = useMemo(() => {
    if (!selectedProject?.transformed_preview?.length) return [];
    const firstRow = selectedProject.transformed_preview[0];
    const keys = Object.keys(firstRow);
    const labelKey = keys.find((key) => typeof firstRow[key] === 'string') || keys[0];
    const valueKey = keys.find((key) => typeof firstRow[key] === 'number') || keys[1];
    return selectedProject.transformed_preview.map((row) => ({
      label: String(row[labelKey] ?? ''),
      value: Number(row[valueKey] ?? 0),
    }));
  }, [selectedProject]);

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!sessionUser) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.28),_transparent_35%),radial-gradient(circle_at_right,_rgba(139,92,246,0.2),_transparent_25%),linear-gradient(180deg,#020617,#0f172a)] text-white">
        <div className="mx-auto grid min-h-screen max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm text-sky-200 backdrop-blur-xl">
              <Sparkles className="h-4 w-4" /> Production-grade AI spreadsheet SaaS
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-tight sm:text-6xl">Automate spreadsheets, transform data, and monetize AI workflows from one premium platform.</h1>
            <p className="max-w-2xl text-lg text-slate-300">
              SheetForge AI combines authenticated workspaces, saved projects, cloud-ready dataset storage paths, AI transformation logs, analytics dashboards, exports, and subscription infrastructure prepared for monetization.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: 'CSV/XLSX uploads', icon: FileSpreadsheet },
                { label: 'Natural language transforms', icon: BrainCircuit },
                { label: 'Subscription-ready SaaS billing', icon: CreditCard },
              ].map((item) => {
                const ItemIcon = item.icon;
                return (
                  <div key={item.label} className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                    <ItemIcon className="mb-4 h-6 w-6 text-sky-300" />
                    <p className="text-sm text-slate-200">{item.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/8 p-8 shadow-2xl shadow-sky-950/30 backdrop-blur-2xl">
            <div className="mb-6 flex rounded-2xl bg-slate-950/60 p-1 text-sm">
              <button className={`flex-1 rounded-xl px-4 py-2 ${authMode === 'signin' ? 'bg-sky-500 text-white' : 'text-slate-300'}`} onClick={() => setAuthMode('signin')}>Sign in</button>
              <button className={`flex-1 rounded-xl px-4 py-2 ${authMode === 'signup' ? 'bg-sky-500 text-white' : 'text-slate-300'}`} onClick={() => setAuthMode('signup')}>Sign up</button>
            </div>
            <form className="space-y-4" onSubmit={handleEmailAuth}>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Email</span>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <input className="w-full bg-transparent outline-none" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Password</span>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
                  <Shield className="h-4 w-4 text-slate-400" />
                  <input className="w-full bg-transparent outline-none" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </label>
              {authError ? <p className="text-sm text-rose-300">{authError}</p> : null}
              <button className="w-full rounded-2xl bg-sky-500 px-4 py-3 font-medium transition hover:bg-sky-400">{authMode === 'signup' ? 'Create workspace' : 'Enter dashboard'}</button>
            </form>
            <div className="my-5 text-center text-sm text-slate-400">or</div>
            <button onClick={() => signInWithGoogle('SheetForge AI')} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-medium transition hover:bg-white/10">Continue with Google</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#020617,#0f172a)] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/75 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300">SheetForge AI</p>
            <h1 className="text-2xl font-semibold">Spreadsheet automation cloud</h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-300"><MoonStar className="h-4 w-4" /></button>
            <div className="hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-3 md:block">
              <p className="text-xs text-slate-400">Workspace</p>
              <p className="text-sm font-medium">{sessionUser.email}</p>
            </div>
            <button onClick={() => supabase.auth.signOut()} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm transition hover:bg-white/5"><LogOut className="h-4 w-4" /> Sign out</button>
          </div>
        </div>
      </header>

      {loadingDashboard ? (
        <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-sky-300" /></div>
      ) : (
        <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
          <section className="grid gap-4 xl:grid-cols-5">
            {[
              { label: 'Saved projects', value: summary?.totalProjects ?? 0, icon: FolderKanban },
              { label: 'Rows analyzed', value: summary?.totalRows ?? 0, icon: Database },
              { label: 'AI runs', value: summary?.aiRuns ?? 0, icon: Bot },
              { label: 'Storage used', value: `${summary?.storageUsedMb ?? 0} MB`, icon: Upload },
              { label: 'Active plan', value: summary?.activePlan ?? 'starter', icon: CreditCard },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-[1.75rem] border border-white/10 bg-white/6 p-5 backdrop-blur-2xl">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-400">{card.label}</p>
                    <Icon className="h-5 w-5 text-sky-300" />
                  </div>
                  <p className="mt-5 text-3xl font-semibold">{card.value}</p>
                </div>
              );
            })}
          </section>

          <section className="grid gap-8 xl:grid-cols-[0.95fr_1.35fr]">
            <div className="space-y-8">
              <div className="rounded-[2rem] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl">
                <div className="mb-5 flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-sky-300" />
                  <div>
                    <h2 className="text-xl font-semibold">Upload dataset</h2>
                    <p className="text-sm text-slate-400">CSV/XLSX-ready ingest layer with cloud storage path metadata.</p>
                  </div>
                </div>
                <form className="space-y-3" onSubmit={createProject}>
                  <input className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" placeholder="Project name" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} />
                  <input className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" placeholder="Description" value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} />
                  <select className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" value={projectForm.source_type} onChange={(e) => setProjectForm({ ...projectForm, source_type: e.target.value })}>
                    <option value="csv">CSV upload</option>
                    <option value="xlsx">XLSX upload</option>
                    <option value="sheet">Connected sheet</option>
                  </select>
                  <textarea className="min-h-56 w-full rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" value={uploadText} onChange={(e) => setUploadText(e.target.value)} />
                  <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 font-medium transition hover:bg-sky-400">
                    {savingKey === 'project' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Save dataset project
                  </button>
                </form>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl">
                <h2 className="text-xl font-semibold">Projects</h2>
                <div className="mt-4 space-y-3">
                  {projects.map((project) => (
                    <button key={project.id} onClick={() => setSelectedProjectId(project.id)} className={`w-full rounded-2xl border px-4 py-4 text-left transition ${selectedProject?.id === project.id ? 'border-sky-400/40 bg-sky-400/10' : 'border-white/10 bg-slate-950/50 hover:bg-white/5'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-medium">{project.name}</h3>
                          <p className="mt-1 text-sm text-slate-400">{project.description}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                        <span className="rounded-full border border-white/10 px-3 py-1">{project.row_count} rows</span>
                        <span className="rounded-full border border-white/10 px-3 py-1">{project.column_count} columns</span>
                        <span className="rounded-full border border-white/10 px-3 py-1">{project.source_type}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="rounded-[2rem] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">AI data assistant</h2>
                    <p className="text-sm text-slate-400">Natural language commands for cleaning, grouping, summarization, and chart recommendations.</p>
                  </div>
                  <Wand2 className="h-5 w-5 text-sky-300" />
                </div>
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-4">
                    <textarea className="min-h-32 w-full rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none" value={assistantPrompt} onChange={(e) => setAssistantPrompt(e.target.value)} />
                    <button onClick={runAssistant} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 px-4 py-3 font-medium transition hover:bg-violet-400">
                      {savingKey === 'assistant' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />} Run AI transformation
                    </button>
                    <div className="rounded-3xl border border-violet-400/20 bg-violet-400/10 p-4 text-sm text-violet-100">
                      {latestRun?.response_summary || 'Run the assistant to generate cleaning suggestions, grouped summaries, and chart recommendations.'}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-5">
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Recommended chart</p>
                    <h3 className="mt-2 text-2xl font-semibold">{latestRun?.chart_recommendation || 'Bar chart by category'}</h3>
                    <p className="mt-3 text-sm text-slate-300">Optimized for premium SaaS dashboards, reporting exports, and future embedded analytics monetization.</p>
                    <div className="mt-6 h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid stroke="#1e293b" vertical={false} />
                          <XAxis dataKey="label" stroke="#94a3b8" />
                          <YAxis stroke="#94a3b8" />
                          <Tooltip contentStyle={{ background: '#020617', border: '1px solid #334155' }} />
                          <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                            {chartData.map((entry, index) => <Cell key={`${entry.label}-${index}`} fill={chartPalette[index % chartPalette.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[2rem] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">Dataset preview</h2>
                      <p className="text-sm text-slate-400">Original and transformed data snapshots persist per project.</p>
                    </div>
                    <Database className="h-5 w-5 text-sky-300" />
                  </div>
                  <div className="overflow-hidden rounded-3xl border border-white/10">
                    <div className="max-h-80 overflow-auto bg-slate-950/70">
                      <table className="min-w-full text-sm">
                        <thead className="sticky top-0 bg-slate-900/90 text-left text-slate-300 backdrop-blur">
                          <tr>
                            {selectedProject?.transformed_preview?.[0] ? Object.keys(selectedProject.transformed_preview[0]).map((header) => (
                              <th key={header} className="px-4 py-3 font-medium">{header}</th>
                            )) : <th className="px-4 py-3">No data</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedProject?.transformed_preview || []).map((row, index) => (
                            <tr key={index} className="border-t border-white/5 text-slate-200">
                              {Object.values(row).map((value, cellIndex) => <td key={cellIndex} className="px-4 py-3">{String(value)}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button onClick={() => selectedProject && exportProject(selectedProject.id, 'csv')} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm transition hover:bg-white/5"><Download className="h-4 w-4" /> {savingKey === 'export-csv' ? 'Exporting…' : 'Export CSV'}</button>
                    <button onClick={() => selectedProject && exportProject(selectedProject.id, 'xlsx')} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm transition hover:bg-white/5"><Download className="h-4 w-4" /> {savingKey === 'export-xlsx' ? 'Exporting…' : 'Export XLSX'}</button>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="rounded-[2rem] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl">
                    <h2 className="text-xl font-semibold">Usage trend</h2>
                    <div className="mt-4 h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={summary?.recentActivity || []}>
                          <CartesianGrid stroke="#1e293b" vertical={false} />
                          <XAxis dataKey="label" stroke="#94a3b8" />
                          <YAxis stroke="#94a3b8" />
                          <Tooltip contentStyle={{ background: '#020617', border: '1px solid #334155' }} />
                          <Line dataKey="value" stroke="#38bdf8" strokeWidth={3} dot={{ fill: '#38bdf8' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-[2rem] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl">
                    <h2 className="text-xl font-semibold">Chart mix</h2>
                    <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                      <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={summary?.chartMix || []} dataKey="value" nameKey="name" innerRadius={45} outerRadius={68} paddingAngle={3}>
                              {(summary?.chartMix || []).map((entry, index) => <Cell key={entry.name} fill={entry.color || chartPalette[index % chartPalette.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ background: '#020617', border: '1px solid #334155' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-3">
                        {(summary?.chartMix || []).map((item) => (
                          <div key={item.name} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm">
                            <div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</div>
                            <span>{item.value}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[2rem] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Recent AI executions</h2>
                  <p className="text-sm text-slate-400">Clean API logs for prompt history, actions, and reusable services.</p>
                </div>
                <Bot className="h-5 w-5 text-sky-300" />
              </div>
              <div className="space-y-3">
                {runs.map((run) => (
                  <div key={run.id} className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-slate-400">{new Date(run.created_at).toLocaleString()}</p>
                        <h3 className="mt-1 font-medium">{run.action_type}</h3>
                        <p className="mt-2 text-sm text-slate-300">{run.prompt}</p>
                      </div>
                      <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs text-violet-100">{run.chart_recommendation}</span>
                    </div>
                    <p className="mt-3 text-sm text-slate-200">{run.response_summary}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-8">
              <div className="rounded-[2rem] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl">
                <h2 className="text-xl font-semibold">Subscription plans</h2>
                <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                  Current: <strong>{subscription?.plan_name || 'starter'}</strong> · <strong>{subscription?.status || 'active'}</strong>
                </div>
                <div className="mt-4 space-y-3">
                  {plans.map((plan) => (
                    <div key={plan.key} className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-medium">{plan.name}</h3>
                          <ul className="mt-3 space-y-1 text-sm text-slate-300">
                            {plan.features.map((feature) => <li key={feature}>• {feature}</li>)}
                          </ul>
                        </div>
                        <p className="text-2xl font-semibold">{plan.price}</p>
                      </div>
                      <button onClick={() => choosePlan(plan.key)} className="mt-4 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium transition hover:bg-white/15">
                        {savingKey === `plan-${plan.key}` ? 'Updating…' : `Choose ${plan.name}`}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/6 p-6 backdrop-blur-2xl">
                <h2 className="text-xl font-semibold">Platform insights</h2>
                <div className="mt-4 space-y-3">
                  {(summary?.insights || []).map((insight) => (
                    <div key={insight} className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4 text-sm text-sky-100">{insight}</div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

export default App;