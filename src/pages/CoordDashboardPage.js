import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Monitor, Printer, Package, AlertTriangle, Star, RefreshCw, Wifi, WifiOff, Clock, Zap, Radio, Trash2, Cpu, MemoryStick, Activity, TrendingUp, BarChart2, Users, Mail, MessageSquare, Send } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useLang } from '../utils/useLang';

const STATUS_COLOR = {
  queued:   { bg: 'rgba(234,179,8,0.12)',   border: 'rgba(234,179,8,0.35)',   text: '#facc15' },
  printing: { bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.35)',  text: '#60a5fa' },
  done:     { bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.35)',   text: '#22c55e' },
  failed:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',   text: '#ef4444' },
};

function SectionTitle({ icon: Icon, title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <Icon size={16} color="var(--accent)" />
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>{title}</span>
      {count !== undefined && (
        <span style={{ fontSize: 10, background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: 10, padding: '1px 7px', fontFamily: 'monospace', fontWeight: 700 }}>{count}</span>
      )}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 16, ...style }}>
      {children}
    </div>
  );
}

function TTLBar({ expiresAt }) {
  const now = Date.now();
  const exp = new Date(expiresAt + 'Z').getTime();
  const total = 30000;
  const remain = Math.max(0, exp - now);
  const pct = Math.round((remain / total) * 100);
  const color = pct > 60 ? '#22c55e' : pct > 30 ? '#facc15' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 2, transition: 'width 1s linear' }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'monospace', color, minWidth: 28 }}>{Math.ceil(remain / 1000)}s</span>
    </div>
  );
}

function formatStock(stockCartons, unites) {
  const upc = unites || 1;
  const totalUnits = Math.round(stockCartons * upc);
  const cx = Math.floor(totalUnits / upc);
  const remAfterCx = totalUnits % upc;
  const demi = Math.floor(remAfterCx / Math.ceil(upc / 2));
  const units = remAfterCx % Math.ceil(upc / 2);
  const parts = [];
  if (cx > 0) parts.push(`${cx} cx`);
  if (demi > 0) parts.push(`${demi} dm`);
  if (units > 0) parts.push(`${units} un`);
  if (parts.length === 0) return '0 cx';
  return parts.join(' + ');
}

function formatBytes(bytes) {
  const gb = bytes / (1024 ** 3);
  return gb >= 1 ? gb.toFixed(1) + ' GB' : (bytes / (1024 ** 2)).toFixed(0) + ' MB';
}

function formatUptime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── KPI Card ─────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color, marginTop: 2, fontWeight: 600 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Jauge circulaire simple ───────────────────────────────────────
function GaugeBar({ label, pct, color, sub }) {
  const c = pct > 80 ? '#ef4444' : pct > 60 ? '#facc15' : color;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: c }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: c, borderRadius: 4, transition: 'width 1s ease' }} />
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Bouton action rapide ──────────────────────────────────────────
function ActionBtn({ icon: Icon, label, onClick, loading, color = 'var(--accent)' }) {
  return (
    <button onClick={onClick} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 9, cursor: loading ? 'not-allowed' : 'pointer', background: color + '14', border: `1px solid ${color}55`, color, fontSize: 12, fontWeight: 600, opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      <Icon size={14} />
      {loading ? '…' : label}
    </button>
  );
}

// ── Tooltip recharts custom ───────────────────────────────────────
function CustomTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {fmt ? fmt(p.value) : p.value}</div>
      ))}
    </div>
  );
}

// ── Formulaire config Gmail ───────────────────────────────────
function GmailConfigForm({ onSaved }) {
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]     = useState('');

  const handleSave = async () => {
    if (!email.trim() || !pass.trim()) { setErr(t('coord','gmailErrRequired')); return; }
    if (pass.replace(/\s/g,'').length < 16) { setErr(t('coord','gmailErrPassLength')); return; }
    setSaving(true); setErr('');
    try {
      const res = await window.electron.emailConfigSet({ gmailUser: email.trim(), gmailPass: pass.replace(/\s/g,'') });
      if (res?.success) { onSaved(email.trim()); }
      else setErr(res?.error || t('coord','gmailErrSave'));
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder={t('coord','gmailEmailPlaceholder')}
        className="form-input" style={{ fontSize:13 }}/>
      <input value={pass} onChange={e => setPass(e.target.value)} placeholder={t('coord','gmailPassPlaceholder')}
        type="password" className="form-input" style={{ fontSize:13 }}/>
      {err && <span style={{ fontSize:11, color:'#ef4444' }}>{err}</span>}
      <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ alignSelf:'flex-start', fontSize:12, padding:'6px 16px' }}>
        {saving ? t('coord','saving') : `\u{1F4BE} ${t('coord','save')}`}
      </button>
    </div>
  );
}

export default function CoordDashboardPage() {
  const { t, fmt, lang } = useLang();
  const intlLocale = lang === 'fr' ? 'fr-FR' : lang === 'en' ? 'en-US' : 'pt-BR';
  const [data, setData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [actionLoading, setActionLoading] = useState({ sync: false, rescan: false, clear: false });
  const [actionFeedback, setActionFeedback] = useState(null);
  // v4.3.0 — Email rapport
  const [emailConfig, setEmailConfig] = useState({ email: '', configured: false });
  const [emailTo, setEmailTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState(null);
  // v4.4.0 — Utilisateurs connectés + broadcast
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [broadcastInput, setBroadcastInput] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const intervalRef = useRef(null);
  const metricsIntervalRef = useRef(null);
  const autoIntervalRef = useRef(null);

  const loadRef = useRef(null);
  const load = useCallback(async () => {
    try {
      const res = await window.electron.coordDashboard();
      if (res?.success) { setData(res); setError(null); setLastRefresh(new Date()); }
      else setError(res?.error || t('coord','unknownError'));
    } catch(e) { setError(e.message); }
    setLoading(false);
  }, []);
  loadRef.current = load;

  const loadMetrics = useCallback(async () => {
    try {
      const res = await window.electron.coordMetrics();
      if (res?.success) setMetrics(res);
    } catch(_e) {}
  }, []);

  useEffect(() => {
    load();
    loadMetrics();
    intervalRef.current = setInterval(load, 5000);
    metricsIntervalRef.current = setInterval(loadMetrics, 10000);
    // v4.3.0 email config
    window.electron.emailConfigGet().then(r => { if (r?.success) { setEmailConfig(r); setEmailTo(r.email || ''); } }).catch(()=>{});
    // v4.4.0 connected users
    const loadUsers = () => window.electron.coordConnectedUsers().then(r => { if (r?.success) setConnectedUsers(r.data || []); }).catch(()=>{});
    loadUsers();
    const usersInterval = setInterval(loadUsers, 10000);
    return () => { clearInterval(intervalRef.current); clearInterval(metricsIntervalRef.current); clearInterval(usersInterval); };
  }, [load, loadMetrics]);

  useEffect(() => {
    const hasPrinting = data?.printQueue?.some(j => j.status === 'printing' || j.status === 'queued');
    if (hasPrinting) { autoIntervalRef.current = setInterval(load, 3000); }
    else { clearInterval(autoIntervalRef.current); }
    return () => clearInterval(autoIntervalRef.current);
  }, [data, load]);

  const showFeedback = (msg, ok = true) => {
    setActionFeedback({ msg, ok });
    setTimeout(() => setActionFeedback(null), 2500);
  };

  const handleForceSync = async () => {
    setActionLoading(s => ({ ...s, sync: true }));
    try { const res = await window.electron.coordForceSync(); showFeedback(res?.success ? t('coord','syncDone') : (res?.error||t('coord','genericError')), res?.success); }
    catch(e) { showFeedback(e.message, false); }
    setActionLoading(s => ({ ...s, sync: false }));
  };

  const handleRescan = async () => {
    setActionLoading(s => ({ ...s, rescan: true }));
    try { const res = await window.electron.coordRescan(); showFeedback(res?.success ? t('coord','rescanDone') : (res?.error||t('coord','genericError')), res?.success); }
    catch(e) { showFeedback(e.message, false); }
    setActionLoading(s => ({ ...s, rescan: false }));
  };

  const handleClearQueue = async () => {
    setActionLoading(s => ({ ...s, clear: true }));
    try { const res = await window.electron.coordClearQueue(); showFeedback(res?.success ? t('coord','clearDone') : (res?.error||t('coord','genericError')), res?.success); if (res?.success) load(); }
    catch(e) { showFeedback(e.message, false); }
    setActionLoading(s => ({ ...s, clear: false }));
  };

  const handleSendEmail = async () => {
    if (!emailTo.trim()) return;
    setEmailSending(true);
    setEmailFeedback(null);
    try {
      const built = await window.electron.emailReportBuild({});
      if (!built?.success) { setEmailFeedback({ msg: built?.error || t('coord','emailReportError'), ok: false }); setEmailSending(false); return; }
      const res = await window.electron.emailReportSend({ to: emailTo.trim(), subject: built.subject, html: built.html });
      setEmailFeedback({ msg: res?.success ? t('coord','emailReportSent') : (res?.error || t('coord','emailReportError')), ok: !!res?.success });
    } catch(e) { setEmailFeedback({ msg: e.message, ok: false }); }
    setEmailSending(false);
    setTimeout(() => setEmailFeedback(null), 4000);
  };

  const handleBroadcast = async () => {
    if (!broadcastInput.trim() || broadcastSending) return;
    setBroadcastSending(true);
    try {
      const res = await window.electron.coordBroadcastMsg({ content: broadcastInput.trim() });
      if (res?.success) { showFeedback(t('coord','broadcastSent'), true); setBroadcastInput(''); }
      else showFeedback(res?.error || t('coord','genericError'), false);
    } catch(e) { showFeedback(e.message, false); }
    setBroadcastSending(false);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
      {t('coord','loading')}
    </div>
  );

  if (!data) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
      <div style={{ color: 'var(--danger)', fontSize: 14 }}>{t('coord','loadError')}</div>
      {error && <div style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'monospace', maxWidth: 400, textAlign: 'center' }}>{error}</div>}
      <button onClick={load} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px' }}>
        <RefreshCw size={14} /> {t('coord','refresh')}
      </button>
    </div>
  );

  const { machines = [], printQueue = [], reservations = [], coordLog = [], stockAlerte = [], isCoordinator, coordinatorLabel, degradedMode } = data;
  const onlineMachines = machines.filter(m => m.status === 'online').length;
  const pendingJobs = printQueue.filter(j => j.status === 'queued' || j.status === 'printing').length;

  const statusLabel = { queued: t('coord','statusQueued'), printing: t('coord','statusPrinting'), done: t('coord','statusDone'), failed: t('coord','statusFailed') };

  // Préparer données graphique ventes — remplir jours manquants
  const ventesData = (() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const jour = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(intlLocale, { weekday: 'short', day: 'numeric' });
      const found = metrics?.ventes7j?.find(v => v.jour === jour);
      days.push({ label, nb: found?.nb_ventes || 0, total: found?.total_aoa || 0 });
    }
    return days;
  })();

  const syncData = (() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const jour = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(intlLocale, { weekday: 'short', day: 'numeric' });
      const found = metrics?.sync7j?.find(s => s.jour === jour);
      days.push({ label, ops: found?.nb_ops || 0 });
    }
    return days;
  })();

  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Monitor size={20} color="var(--accent)" />
            {t('coord','title')}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {isCoordinator
              ? <span style={{ color: '#63b3ed' }}>{'\u2B50'} {t('coord','thisMachineIsCoord')}</span>
              : <span>{t('coord','coordinator')}: <strong style={{ color: '#e8c547' }}>{coordinatorLabel || '—'}</strong></span>}
            {degradedMode && <span style={{ color: 'var(--danger)', marginLeft: 12 }}>{'\u26A0'}{'\uFE0F'} {t('coord','degradedMode')}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastRefresh && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{lastRefresh.toLocaleTimeString(intlLocale)}</span>}
          <button onClick={load} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px' }}>
            <RefreshCw size={14} /> {t('coord','refresh')}
          </button>
        </div>
      </div>

      {/* ── KPI CARDS ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiCard icon={Wifi}          label={t('coord','kpiMachines')}     value={`${onlineMachines}/${machines.length}`} color="#22c55e" sub={onlineMachines===machines.length ? t('coord','kpiAllOnline') : null} />
        <KpiCard icon={Printer}       label={t('coord','kpiPrintJobs')}    value={pendingJobs}  color={pendingJobs>0?'#60a5fa':'#6b7280'} sub={pendingJobs>0?t('coord','kpiJobsPending'):null} />
        <KpiCard icon={AlertTriangle} label={t('coord','kpiStockAlert')}   value={stockAlerte.length} color={stockAlerte.length>0?'#facc15':'#6b7280'} sub={stockAlerte.length>0?t('coord','kpiCheckStock'):null} />
        <KpiCard icon={Clock}         label={t('coord','kpiReservations')} value={reservations.length} color={reservations.length>0?'#f97316':'#6b7280'} />
      </div>

      {/* ── MONITORING SYSTÈME ────────────────────────────────── */}
      {metrics && (
        <Card>
          <SectionTitle icon={Cpu} title={t('coord','systemMonitor')} />
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <GaugeBar label="CPU" pct={metrics.cpu} color="#60a5fa" sub={`${os_cpuCount()} ${t('coord','cores')}`} />
            <GaugeBar label="RAM" pct={metrics.ram.pct} color="#a78bfa" sub={`${formatBytes(metrics.ram.used)} / ${formatBytes(metrics.ram.total)}`} />
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 5 }}>{t('coord','uptime')}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{formatUptime(metrics.uptime)}</div>
            </div>
          </div>
        </Card>
      )}

      {/* ── GRAPHIQUES ────────────────────────────────────────── */}
      {metrics && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Ventes 7j */}
          <Card style={{ marginBottom: 0 }}>
            <SectionTitle icon={TrendingUp} title={t('coord','chartSales7d')} />
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={ventesData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gVentes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e8c547" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#e8c547" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip content={<CustomTooltip fmt={v => fmt(v)} />} />
                <Area type="monotone" dataKey="total" name={t('coord','chartRevenue')} stroke="#e8c547" fill="url(#gVentes)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Top 5 produits */}
          <Card style={{ marginBottom: 0 }}>
            <SectionTitle icon={BarChart2} title={t('coord','chartTopProducts')} />
            {metrics.topProduits?.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={metrics.topProduits} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="nom" tick={{ fontSize: 9, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="qte" name={t('coord','chartQty')} fill="#60a5fa" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '40px 0' }}>{t('coord','noData')}</div>
            )}
          </Card>
        </div>
      )}

      {/* ── ACTIONS RAPIDES ───────────────────────────────────── */}
      <Card>
        <SectionTitle icon={Zap} title={t('coord','quickActions')} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <ActionBtn icon={RefreshCw} label={t('coord','actionForceSync')}  onClick={handleForceSync}  loading={actionLoading.sync}   color="#60a5fa" />
          <ActionBtn icon={Radio}     label={t('coord','actionRescan')}     onClick={handleRescan}     loading={actionLoading.rescan} color="#a78bfa" />
          <ActionBtn icon={Trash2}    label={t('coord','actionClearQueue')} onClick={handleClearQueue} loading={actionLoading.clear}  color="#f97316" />
          {actionFeedback && (
            <span style={{ fontSize: 12, fontWeight: 600, color: actionFeedback.ok ? '#22c55e' : '#ef4444', marginLeft: 8 }}>
              {actionFeedback.ok ? '\u2705' : '\u274C'} {actionFeedback.msg}
            </span>
          )}
        </div>
      </Card>

      {/* ── TOPOLOGIE RÉSEAU ──────────────────────────────────── */}
      <Card>
        <SectionTitle icon={Wifi} title={t('coord','networkStatus')} count={`${onlineMachines}/${machines.length}`} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {machines.map((m) => (
            <div key={m.machine_id} style={{ padding: '12px 14px', borderRadius: 10, background: m.status==='online' ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${m.status==='online' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.2)'}`, position: 'relative' }}>
              {m.isCoordinator && <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 14 }}>{'\u2B50'}</span>}
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                {m.status==='online' ? <Wifi size={12} color="#22c55e"/> : <WifiOff size={12} color="#ef4444"/>}
                {m.machine_label || m.machine_id?.slice(0,8)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{m.ip || '—'}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700, background: m.status==='online'?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)', color: m.status==='online'?'#22c55e':'#ef4444' }}>
                  {m.status==='online' ? t('coord','online') : t('coord','offline')}
                </span>
                {m.isCoordinator && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700, background: 'rgba(99,179,237,0.15)', color: '#63b3ed' }}>{t('coord','coordBadge')}</span>}
                {m.isLocal && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700, background: 'rgba(232,197,71,0.12)', color: '#e8c547' }}>{t('coord','local')}</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── FILE D'IMPRESSION ─────────────────────────────────── */}
      <Card>
        <SectionTitle icon={Printer} title={t('coord','printQueue')} count={printQueue.length} />
        {printQueue.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>{t('coord','noPrintJobs')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {printQueue.map((job) => {
              const sc = STATUS_COLOR[job.status] || STATUS_COLOR.queued;
              return (
                <div key={job.job_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: sc.bg, border: `1px solid ${sc.border}`, fontSize: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc.text, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'monospace', color: sc.text, fontWeight: 700, minWidth: 80 }}>{statusLabel[job.status] || job.status}</span>
                  <span style={{ flex: 1, color: 'var(--text-primary)', fontWeight: 600 }}>{job.print_type || '—'}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{job.machine_source || '—'}</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 11 }}>{job.created_at ? new Date(job.created_at+'Z').toLocaleTimeString(intlLocale) : '—'}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* ── RÉSERVATIONS ──────────────────────────────────── */}
        <Card style={{ marginBottom: 0 }}>
          <SectionTitle icon={Clock} title={t('coord','activeReservations')} count={reservations.length} />
          {reservations.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>{t('coord','noReservations')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reservations.map((r) => (
                <div key={r.reservation_id} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-hover)', border: '1px solid var(--border)', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600 }}>{r.product_nom || r.product_id}</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>×{r.qty_reserved}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>{r.machine_id?.slice(0,8) || '—'}</div>
                  <TTLBar expiresAt={r.expires_at} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── STOCK EN ALERTE ───────────────────────────────── */}
        <Card style={{ marginBottom: 0 }}>
          <SectionTitle icon={AlertTriangle} title={t('coord','stockAlert')} count={stockAlerte.length} />
          {stockAlerte.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--success)', fontSize: 13, padding: '12px 0' }}>{'\u2705'} {t('coord','noStockAlert')}</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, padding: '6px 12px', background: 'var(--bg-hover)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                <span>{t('coord','product')}</span><span>{t('coord','reserved')}</span><span>{t('coord','available')}</span>
              </div>
              {stockAlerte.map((p) => {
                const upc = p.unites || 1;
                const dispCartons = p.stock_cartons - (p.qty_reserved || 0);
                const isRupture = dispCartons <= 0;
                const dispStr = isRupture ? `0 ${t('coord','boxesShort')}` : formatStock(dispCartons, upc);
                return (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, background: isRupture ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                    <span style={{ fontWeight: 600, color: isRupture ? 'var(--danger)' : 'var(--text-primary)' }}>{p.nom}</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', textAlign: 'right', fontSize: 11 }}>{p.qty_reserved || 0}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isRupture ? 'var(--danger)' : dispCartons<=2 ? '#facc15' : 'var(--success)', textAlign: 'right', fontSize: 11 }}>{dispStr}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── UTILISATEURS CONNECTÉS (v4.4.0) ──────────────────── */}
      <Card>
        <SectionTitle icon={Users} title={t('coord','connectedUsers')} count={connectedUsers.filter(u => u.online).length} />
        {connectedUsers.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>{t('coord','noConnectedUsers')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {connectedUsers.map((u, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: u.online ? 'rgba(34,197,94,0.05)' : 'var(--bg-hover)', border: `1px solid ${u.online ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`, fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.online ? '#22c55e' : '#6b7280', flexShrink: 0 }} />
                <span style={{ fontWeight: 700, flex: 1 }}>{u.nom || '—'}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{u.role}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>{u.machine_label || u.machine_id?.slice(0,8)}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>
                  {u.login_at ? new Date(u.login_at+'Z').toLocaleTimeString(intlLocale) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Broadcast rapide depuis coord */}
        <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
            {t('coord','broadcastMsg')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={broadcastInput}
              onChange={e => setBroadcastInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleBroadcast(); }}
              placeholder={t('coord','broadcastPlaceholder')}
              className="form-input"
              style={{ flex: 1, fontSize: 13 }}
            />
            <button onClick={handleBroadcast} disabled={!broadcastInput.trim() || broadcastSending} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>
              <Send size={14} /> {broadcastSending ? '…' : t('coord','broadcastSend')}
            </button>
          </div>
        </div>
      </Card>

      {/* ── RAPPORT EMAIL (v4.3.0) ────────────────────────────── */}
      <Card>
        <SectionTitle icon={Mail} title={t('coord','emailReport')} />

        {/* Config Gmail */}
        {!emailConfig.configured ? (
          <div style={{ background:'rgba(232,197,71,0.06)', border:'1px solid rgba(232,197,71,0.2)', borderRadius:10, padding:14, marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'var(--accent)' }}>{'\u2699'}{'\uFE0F'} {t('coord','gmailConfigTitle')}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:12, lineHeight:1.6 }}>
              {t('coord','gmailConfigStep0')}<br/>
              1. {t('coord','gmailConfigStep1')} <strong style={{ color:'var(--accent)' }}>myaccount.google.com {'\u2192'} Security {'\u2192'} App passwords</strong><br/>
              2. {t('coord','gmailConfigStep2')}<br/>
              3. {t('coord','gmailConfigStep3')}
            </div>
            <GmailConfigForm onSaved={(email) => { setEmailConfig({ email, configured:true }); setEmailTo(email); }}/>
          </div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, fontSize:12 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#22c55e' }}/>
            <span style={{ color:'#22c55e', fontWeight:600 }}>{t('coord','gmailConfigured')}: {emailConfig.email}</span>
            <button onClick={() => setEmailConfig({ email:'', configured:false })} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:11, padding:'0 6px' }}>{t('coord','change')}</button>
          </div>
        )}

        {/* Envoi rapport */}
        {emailConfig.configured && (
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <input value={emailTo} onChange={e => setEmailTo(e.target.value)}
              placeholder={t('coord','emailRecipientPlaceholder')}
              className="form-input" style={{ flex:1, fontSize:13, minWidth:200 }}/>
            <button onClick={handleSendEmail} disabled={!emailTo.trim() || emailSending} className="btn btn-primary"
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', fontSize:13, whiteSpace:'nowrap' }}>
              <Mail size={14}/> {emailSending ? t('coord','sendingEmail') : t('coord','sendReport')}
            </button>
          </div>
        )}
        {emailFeedback && (
          <div style={{ marginTop:8, fontSize:12, fontWeight:600, color: emailFeedback.ok?'#22c55e':'#ef4444' }}>
            {emailFeedback.ok ? '\u2705' : '\u274C'} {emailFeedback.msg}
          </div>
        )}
      </Card>

      {/* ── LOG ÉLECTIONS ─────────────────────────────────────── */}
      <Card style={{ marginTop: 16 }}>
        <SectionTitle icon={Star} title={t('coord','electionLog')} count={coordLog.length} />
        {coordLog.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>{t('coord','noEvents')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {coordLog.map((ev, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 12px', borderRadius: 7, background: i===0?'rgba(99,179,237,0.07)':'transparent', border: i===0?'1px solid rgba(99,179,237,0.2)':'1px solid transparent', fontSize: 12 }}>
                <span style={{ fontSize: 10 }}>{'\u2B50'}</span>
                <span style={{ fontWeight: 600, color: i===0?'#63b3ed':'var(--text-primary)', flex: 1 }}>{ev.machine_label || ev.machine_id?.slice(0,8) || '—'}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{ev.created_at ? new Date(ev.created_at+'Z').toLocaleString(intlLocale) : '—'}</span>
                {i===0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'rgba(99,179,237,0.15)', color: '#63b3ed', fontWeight: 700 }}>{t('coord','current')}</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// Helper — nombre de CPUs (appelé côté renderer, pas accès à os)
function os_cpuCount() { return ''; }
