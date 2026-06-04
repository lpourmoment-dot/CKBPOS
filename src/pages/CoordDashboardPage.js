import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Monitor, Printer, Package, AlertTriangle, Star, RefreshCw, Wifi, WifiOff, Clock } from 'lucide-react';

// ── Couleurs statuts ──────────────────────────────────────────────
const STATUS_COLOR = {
  queued:   { bg: 'rgba(234,179,8,0.12)',   border: 'rgba(234,179,8,0.35)',   text: '#facc15', label: 'Na fila'     },
  printing: { bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.35)',  text: '#60a5fa', label: 'Imprimindo' },
  done:     { bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.35)',   text: '#22c55e', label: 'Conclu\u00eddo' },
  failed:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',   text: '#ef4444', label: 'Falhou'      },
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
  const total = 30000; // TTL 30s
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

export default function CoordDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const intervalRef = useRef(null);
  const autoIntervalRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await window.electron.coordDashboard();
      if (res?.success) {
        setData(res);
        setLastRefresh(new Date());
      }
    } catch (e) {}
    setLoading(false);
  }, []);

  // Polling 5s
  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 5000);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  // Auto-refresh 3s si un job en cours
  useEffect(() => {
    const hasPrinting = data?.printQueue?.some(j => j.status === 'printing' || j.status === 'queued');
    if (hasPrinting) {
      autoIntervalRef.current = setInterval(load, 3000);
    } else {
      clearInterval(autoIntervalRef.current);
    }
    return () => clearInterval(autoIntervalRef.current);
  }, [data, load]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
      Carregando dashboard...
    </div>
  );

  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--danger)', fontSize: 14 }}>
      Erro ao carregar dados do coordenador.
    </div>
  );

  const { machines = [], printQueue = [], reservations = [], coordLog = [], stockAlerte = [], isCoordinator, coordinatorLabel, degradedMode } = data;
  const onlineMachines = machines.filter(m => m.status === 'online').length;

  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Monitor size={20} color="var(--accent)" />
            Dashboard Coordenador
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {isCoordinator
              ? <span style={{ color: '#63b3ed' }}>⭐ Esta m\u00e1quina \u00e9 o coordenador</span>
              : <span>Coordenador: <strong style={{ color: '#e8c547' }}>{coordinatorLabel || '—'}</strong></span>}
            {degradedMode && <span style={{ color: 'var(--danger)', marginLeft: 12 }}>⚠️ Modo degradado ativo</span>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {lastRefresh.toLocaleTimeString('fr-FR')}
            </span>
          )}
          <button onClick={load} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px' }}>
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* ── SECTION 1 : Statut réseau ──────────────────────────── */}
      <Card>
        <SectionTitle icon={Wifi} title="Estado da Rede" count={`${onlineMachines}/${machines.length}`} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {machines.map((m) => (
            <div key={m.machine_id} style={{
              padding: '12px 14px', borderRadius: 10,
              background: m.status === 'online' ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
              border: `1px solid ${m.status === 'online' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.2)'}`,
              position: 'relative',
            }}>
              {m.isCoordinator && (
                <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 14 }} title="Coordenador">⭐</span>
              )}
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                {m.status === 'online'
                  ? <Wifi size={12} color="#22c55e" />
                  : <WifiOff size={12} color="#ef4444" />}
                {m.machine_label || m.machine_id?.slice(0, 8)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{m.ip || '—'}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700,
                  background: m.status === 'online' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color: m.status === 'online' ? '#22c55e' : '#ef4444' }}>
                  {m.status === 'online' ? 'Online' : 'Offline'}
                </span>
                {m.isCoordinator && (
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700, background: 'rgba(99,179,237,0.15)', color: '#63b3ed' }}>COORD</span>
                )}
                {m.isLocal && (
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700, background: 'rgba(232,197,71,0.12)', color: '#e8c547' }}>Local</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── SECTION 2 : File d'impression ─────────────────────── */}
      <Card>
        <SectionTitle icon={Printer} title="Fila de Impress\u00e3o" count={printQueue.length} />
        {printQueue.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>Nenhum job de impress\u00e3o</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {printQueue.map((job) => {
              const sc = STATUS_COLOR[job.status] || STATUS_COLOR.queued;
              return (
                <div key={job.job_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: sc.bg, border: `1px solid ${sc.border}`, fontSize: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc.text, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'monospace', color: sc.text, fontWeight: 700, minWidth: 80 }}>{sc.label}</span>
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
          <SectionTitle icon={Clock} title="Reservas de Stock Ativas" count={reservations.length} />
          {reservations.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>Nenhuma reserva ativa</div>
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
          <SectionTitle icon={AlertTriangle} title="Stock em Alerta" count={stockAlerte.length} />
          {stockAlerte.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--success)', fontSize: 13, padding: '12px 0' }}>✅ Nenhum produto em alerta</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, padding: '6px 12px', background: 'var(--bg-hover)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                <span>Produto</span><span>Reservado</span><span>Dispon\u00edvel</span>
              </div>
              {stockAlerte.map((p) => {
                const disponivel = p.stock_cartons - (p.qty_reserved || 0);
                const isRupture = disponivel <= 0;
                return (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, background: isRupture ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                    <span style={{ fontWeight: 600, color: isRupture ? 'var(--danger)' : 'var(--text-primary)' }}>{p.nom}</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', textAlign: 'right' }}>{p.qty_reserved || 0}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isRupture ? 'var(--danger)' : disponivel <= 2 ? '#facc15' : 'var(--success)', textAlign: 'right' }}>
                      {disponivel} cx
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
        <SectionTitle icon={Star} title="Log Elei\u00e7\u00f5es Coordenador" count={coordLog.length} />
        {coordLog.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>Nenhum evento registado</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {coordLog.map((ev, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 12px', borderRadius: 7, background: i === 0 ? 'rgba(99,179,237,0.07)' : 'transparent', border: i === 0 ? '1px solid rgba(99,179,237,0.2)' : '1px solid transparent', fontSize: 12 }}>
                <span style={{ fontSize: 10 }}>⭐</span>
                <span style={{ fontWeight: 600, color: i === 0 ? '#63b3ed' : 'var(--text-primary)', flex: 1 }}>{ev.machine_label || ev.machine_id?.slice(0, 8) || '—'}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                  {ev.created_at ? new Date(ev.created_at + 'Z').toLocaleString('fr-FR') : '—'}
                </span>
                {i === 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'rgba(99,179,237,0.15)', color: '#63b3ed', fontWeight: 700 }}>Atual</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
