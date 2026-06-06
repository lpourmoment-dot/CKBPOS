import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Monitor, Printer, Package, AlertTriangle, Star, RefreshCw, Wifi, WifiOff, Clock, Zap, Radio, Trash2 } from 'lucide-react';
import { useLang } from '../utils/useLang';

// ── Couleurs statuts ──────────────────────────────────────────────
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

// ── KPI Card ─────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: color + '1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
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

// ── Bouton action rapide ──────────────────────────────────────────
function ActionBtn({ icon: Icon, label, onClick, loading, color = 'var(--accent)' }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 16px', borderRadius: 9, cursor: loading ? 'not-allowed' : 'pointer',
        background: color + '14', border: `1px solid ${color}55`,
        color, fontSize: 12, fontWeight: 600, opacity: loading ? 0.6 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <Icon size={14} />
      {loading ? '…' : label}
    </button>
  );
}

export default function CoordDashboardPage() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [actionLoading, setActionLoading] = useState({ sync: false, rescan: false, clear: false });
  const [actionFeedback, setActionFeedback] = useState(null);
  const intervalRef = useRef(null);
  const autoIntervalRef = useRef(null);

  const loadRef = useRef(null);
  const load = useCallback(async () => {
    try {
      const res = await window.electron.coordDashboard();
      if (res?.success) {
        setData(res);
        setError(null);
        setLastRefresh(new Date());
      } else {
        setError(res?.error || 'Erro desconhecido');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);
  loadRef.current = load;

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 5000);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  useEffect(() => {
    const hasPrinting = data?.printQueue?.some(j => j.status === 'printing' || j.status === 'queued');
    if (hasPrinting) {
      autoIntervalRef.current = setInterval(load, 3000);
    } else {
      clearInterval(autoIntervalRef.current);
    }
    return () => clearInterval(autoIntervalRef.current);
  }, [data, load]);

  const showFeedback = (msg, ok = true) => {
    setActionFeedback({ msg, ok });
    setTimeout(() => setActionFeedback(null), 2500);
  };

  const handleForceSync = async () => {
    setActionLoading(s => ({ ...s, sync: true }));
    try {
      const res = await window.electron.coordForceSync();
      showFeedback(res?.success ? t('coord', 'syncDone') : (res?.error || 'Erro'), res?.success);
    } catch(e) { showFeedback(e.message, false); }
    setActionLoading(s => ({ ...s, sync: false }));
  };

  const handleRescan = async () => {
    setActionLoading(s => ({ ...s, rescan: true }));
    try {
      const res = await window.electron.coordRescan();
      showFeedback(res?.success ? t('coord', 'rescanDone') : (res?.error || 'Erro'), res?.success);
    } catch(e) { showFeedback(e.message, false); }
    setActionLoading(s => ({ ...s, rescan: false }));
  };

  const handleClearQueue = async () => {
    setActionLoading(s => ({ ...s, clear: true }));
    try {
      const res = await window.electron.coordClearQueue();
      showFeedback(res?.success ? t('coord', 'clearDone') : (res?.error || 'Erro'), res?.success);
      if (res?.success) load();
    } catch(e) { showFeedback(e.message, false); }
    setActionLoading(s => ({ ...s, clear: false }));
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
      {t('coord', 'loading')}
    </div>
  );

  if (!data) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
      <div style={{ color: 'var(--danger)', fontSize: 14 }}>{t('coord', 'loadError')}</div>
      {error && <div style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'monospace', maxWidth: 400, textAlign: 'center' }}>{error}</div>}
      <button onClick={load} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 13 }}>
        <RefreshCw size={14} /> {t('coord', 'refresh')}
      </button>
    </div>
  );

  const { machines = [], printQueue = [], reservations = [], coordLog = [], stockAlerte = [], isCoordinator, coordinatorLabel, degradedMode } = data;
  const onlineMachines = machines.filter(m => m.status === 'online').length;
  const pendingJobs = printQueue.filter(j => j.status === 'queued' || j.status === 'printing').length;

  const statusLabel = {
    queued:   t('coord', 'statusQueued'),
    printing: t('coord', 'statusPrinting'),
    done:     t('coord', 'statusDone'),
    failed:   t('coord', 'statusFailed'),
  };

  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Monitor size={20} color="var(--accent)" />
            {t('coord', 'title')}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {isCoordinator
              ? <span style={{ color: '#63b3ed' }}>⭐ {t('coord', 'thisMachineIsCoord')}</span>
              : <span>{t('coord', 'coordinator')}: <strong style={{ color: '#e8c547' }}>{coordinatorLabel || '—'}</strong></span>}
            {degradedMode && <span style={{ color: 'var(--danger)', marginLeft: 12 }}>⚠️ {t('coord', 'degradedMode')}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {lastRefresh.toLocaleTimeString('fr-FR')}
            </span>
          )}
          <button onClick={load} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px' }}>
            <RefreshCw size={14} /> {t('coord', 'refresh')}
          </button>
        </div>
      </div>

      {/* ── KPI CARDS ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard
          icon={Wifi}
          label={t('coord', 'kpiMachines')}
          value={`${onlineMachines}/${machines.length}`}
          color="#22c55e"
          sub={onlineMachines === machines.length ? t('coord', 'kpiAllOnline') : null}
        />
        <KpiCard
          icon={Printer}
          label={t('coord', 'kpiPrintJobs')}
          value={pendingJobs}
          color={pendingJobs > 0 ? '#60a5fa' : '#6b7280'}
          sub={pendingJobs > 0 ? t('coord', 'kpiJobsPending') : null}
        />
        <KpiCard
          icon={AlertTriangle}
          label={t('coord', 'kpiStockAlert')}
          value={stockAlerte.length}
          color={stockAlerte.length > 0 ? '#facc15' : '#6b7280'}
          sub={stockAlerte.length > 0 ? t('coord', 'kpiCheckStock') : null}
        />
        <KpiCard
          icon={Clock}
          label={t('coord', 'kpiReservations')}
          value={reservations.length}
          color={reservations.length > 0 ? '#f97316' : '#6b7280'}
          sub={null}
        />
      </div>

      {/* ── ACTIONS RAPIDES ──────────────────────────────────────── */}
      <Card>
        <SectionTitle icon={Zap} title={t('coord', 'quickActions')} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <ActionBtn icon={RefreshCw} label={t('coord', 'actionForceSync')} onClick={handleForceSync} loading={actionLoading.sync} color="#60a5fa" />
          <ActionBtn icon={Radio}     label={t('coord', 'actionRescan')}    onClick={handleRescan}    loading={actionLoading.rescan} color="#a78bfa" />
          <ActionBtn icon={Trash2}    label={t('coord', 'actionClearQueue')}onClick={handleClearQueue} loading={actionLoading.clear} color="#f97316" />
          {actionFeedback && (
            <span style={{ fontSize: 12, fontWeight: 600, color: actionFeedback.ok ? '#22c55e' : '#ef4444', marginLeft: 8 }}>
              {actionFeedback.ok ? '✅' : '❌'} {actionFeedback.msg}
            </span>
          )}
        </div>
      </Card>

      {/* ── SECTION 1 : Statut réseau ──────────────────────────── */}
      <Card>
        <SectionTitle icon={Wifi} title={t('coord', 'networkStatus')} count={`${onlineMachines}/${machines.length}`} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {machines.map((m) => (
            <div key={m.machine_id} style={{
              padding: '12px 14px', borderRadius: 10,
              background: m.status === 'online' ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
              border: `1px solid ${m.status === 'online' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.2)'}`,
              position: 'relative',
            }}>
              {m.isCoordinator && (
                <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 14 }} title={t('coord', 'coordinator')}>⭐</span>
              )}
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                {m.status === 'online' ? <Wifi size={12} color="#22c55e" /> : <WifiOff size={12} color="#ef4444" />}
                {m.machine_label || m.machine_id?.slice(0, 8)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{m.ip || '—'}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700,
                  background: m.status === 'online' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color: m.status === 'online' ? '#22c55e' : '#ef4444' }}>
                  {m.status === 'online' ? t('coord', 'online') : t('coord', 'offline')}
                </span>
                {m.isCoordinator && (
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700, background: 'rgba(99,179,237,0.15)', color: '#63b3ed' }}>COORD</span>
                )}
                {m.isLocal && (
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700, background: 'rgba(232,197,71,0.12)', color: '#e8c547' }}>{t('coord', 'local')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── SECTION 2 : File d'impression ─────────────────────── */}
      <Card>
        <SectionTitle icon={Printer} title={t('coord', 'printQueue')} count={printQueue.length} />
        {printQueue.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>{t('coord', 'noPrintJobs')}</div>
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
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 11 }}>
                    {job.created_at ? new Date(job.created_at + 'Z').toLocaleTimeString('fr-FR') : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* ── SECTION 3 : Réservations stock actives ─────────── */}
        <Card style={{ marginBottom: 0 }}>
          <SectionTitle icon={Clock} title={t('coord', 'activeReservations')} count={reservations.length} />
          {reservations.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>{t('coord', 'noReservations')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reservations.map((r) => (
                <div key={r.reservation_id} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-hover)', border: '1px solid var(--border)', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600 }}>{r.product_nom || r.product_id}</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>×{r.qty_reserved}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>{r.machine_id?.slice(0, 8) || '—'}</div>
                  <TTLBar expiresAt={r.expires_at} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── SECTION 4 : Stock en alerte ────────────────────── */}
        <Card style={{ marginBottom: 0 }}>
          <SectionTitle icon={AlertTriangle} title={t('coord', 'stockAlert')} count={stockAlerte.length} />
          {stockAlerte.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--success)', fontSize: 13, padding: '12px 0' }}>✅ {t('coord', 'noStockAlert')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, padding: '6px 12px', background: 'var(--bg-hover)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                <span>{t('coord', 'product')}</span><span>{t('coord', 'reserved')}</span><span>{t('coord', 'available')}</span>
              </div>
              {stockAlerte.map((p) => {
                const upc = p.unites || 1;
                const dispCartons = p.stock_cartons - (p.qty_reserved || 0);
                const isRupture = dispCartons <= 0;
                const dispStr = isRupture ? '0 cx' : formatStock(dispCartons, upc);
                return (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, background: isRupture ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                    <span style={{ fontWeight: 600, color: isRupture ? 'var(--danger)' : 'var(--text-primary)' }}>{p.nom}</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', textAlign: 'right', fontSize: 11 }}>{p.qty_reserved || 0}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isRupture ? 'var(--danger)' : dispCartons <= 2 ? '#facc15' : 'var(--success)', textAlign: 'right', fontSize: 11 }}>
                      {dispStr}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── SECTION 5 : Log élections coordinateur ─────────────── */}
      <Card style={{ marginTop: 16 }}>
        <SectionTitle icon={Star} title={t('coord', 'electionLog')} count={coordLog.length} />
        {coordLog.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>{t('coord', 'noEvents')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {coordLog.map((ev, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 12px', borderRadius: 7, background: i === 0 ? 'rgba(99,179,237,0.07)' : 'transparent', border: i === 0 ? '1px solid rgba(99,179,237,0.2)' : '1px solid transparent', fontSize: 12 }}>
                <span style={{ fontSize: 10 }}>⭐</span>
                <span style={{ fontWeight: 600, color: i === 0 ? '#63b3ed' : 'var(--text-primary)', flex: 1 }}>{ev.machine_label || ev.machine_id?.slice(0, 8) || '—'}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                  {ev.created_at ? new Date(ev.created_at + 'Z').toLocaleString('fr-FR') : '—'}
                </span>
                {i === 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'rgba(99,179,237,0.15)', color: '#63b3ed', fontWeight: 700 }}>{t('coord', 'current')}</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
