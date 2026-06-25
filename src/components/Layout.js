import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useTheme } from '../App';
import { ExpirationBanner } from '../App';
import { useLang } from '../utils/useLang';
import { LayoutDashboard, ShoppingCart, Package, Warehouse, History, Users, Settings, LogOut, Minus, Square, X, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, BookOpen, Terminal, Monitor, MessageSquare, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ShiftModal from './ShiftModal';
import UpdateBanner from './UpdateBanner';

// Animation variants — fade entrant uniquement, pas d'exit pour eviter flash noir
const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } },
  exit:    { opacity: 1 },
};

const sidebarVariants = {
  expanded: { width: 220, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
  collapsed: { width: 64, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const navLabelVariants = {
  visible: { opacity: 1, x: 0, transition: { duration: 0.18, delay: 0.05 } },
  hidden:  { opacity: 0, x: -8, transition: { duration: 0.12 } },
};

const alertVariants = {
  initial: { opacity: 0, scale: 0.92, y: 20 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.18 } },
};

const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.18 } },
};

// Animated page wrapper — used by Outlet via a wrapper component
function AnimatedPage({ children, locationKey }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={locationKey}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{ height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme }        = useTheme();
  const { t, lang } = useLang();
  const intlLocale = lang === 'fr' ? 'fr-FR' : lang === 'en' ? 'en-US' : 'pt-BR';
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showShift, setShowShift] = useState(false);
  const [stockAlertas, setStockAlertas] = useState([]);
  const [showAlertPopup, setShowAlertPopup] = useState(false);
  const [clock, setClock] = useState('');
  // ── v1.4.1 Console in-app ──
  const [showConsole, setShowConsole]     = useState(false);
  const [consoleLogs, setConsoleLogs]     = useState([]);
  const [consoleFilter, setConsoleFilter] = useState('ALL');
  const [hasError, setHasError]           = useState(false);
  const consoleEndRef = useRef(null);
  // ── v4.6.2 Console SQL ──
  const [consoleTab, setConsoleTab]   = useState('logs'); // 'logs' | 'sql'
  const [sqlInput, setSqlInput]       = useState('SELECT COUNT(*) FROM ventes;');
  const [sqlResult, setSqlResult]     = useState(null);
  const [sqlLoading, setSqlLoading]   = useState(false);
  // ── v1.5.0 Sync status ──
  const [syncSt, setSyncSt] = useState({ status: 'idle', pending: 0, online: 0 });
  // ── v1.7.0 Cloud status ──
  const [cloudSt, setCloudSt] = useState({ status: 'disconnected' });
  // ── v1.9.1 Printer mode ──
  const [printerMode, setPrinterMode] = useState({ mode: 'local', targetLabel: '' });
  // ── v3.0 Coordinateur ──
  const [coordStatus, setCoordStatus] = useState({ isCoordinator: false, coordinatorId: '', coordinatorLabel: '', degraded: false });
  // ── v3.7.0 Toast notification sync ──
  const [syncToast, setSyncToast] = useState(null);
  const syncToastTimerRef = useRef(null);
  // ── v4.1.0 Badge messages non lus ──
  const [unreadChat, setUnreadChat] = useState(0);

  // Horloge temps réel
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [intlLocale]);

  // ── v1.4.1 Console in-app — abonnement aux logs ──
  useEffect(() => {
    window.electron.debugLogsGet()
      .then(res => { if (res?.success) setConsoleLogs(res.data || []); })
      .catch(() => {});
    const cleanup = window.electron.onDebugLog((entry) => {
      setConsoleLogs(l => [...l.slice(-249), entry]);
      if (entry.level === 'error') setHasError(true);
    });
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, []);

  // Auto-scroll console vers le bas
  useEffect(() => {
    if (showConsole && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [consoleLogs, showConsole]);

  // Raccourci clavier Ctrl+` pour toggle la console
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault();
        setShowConsole(s => !s);
        setHasError(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── v1.5.0 Sync status ──
  useEffect(() => {
    window.electron.syncStatus().then(res => { if (res?.success) setSyncSt(res); }).catch(() => {});
    const cleanup = window.electron.onSyncUpdate((data) => {
      setSyncSt(data);
      // v3.7.0 — Toast sync si ventes reçues
      if (data.applied && data.applied > 0 && data.fromLabel) {
        const msg = `\u2705 Sync de ${data.fromLabel} — ${data.applied} entrée(s)`;
        setSyncToast({ msg, key: Date.now() });
        clearTimeout(syncToastTimerRef.current);
        syncToastTimerRef.current = setTimeout(() => setSyncToast(null), 3000);
      }
    });
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, []);

  // ── v1.7.0 Cloud status ──
  useEffect(() => {
    window.electron.cloudStatus().then(res => { if (res?.success) setCloudSt(res); }).catch(() => {});
    const cleanup = window.electron.onCloudStatus((data) => setCloudSt(data));
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, []);

  // ── v1.9.1 Printer mode ──
  useEffect(() => {
    window.electron.getPrinterMode().then(res => {
      if (res?.success) setPrinterMode({ mode: res.mode, targetLabel: res.targetLabel });
    }).catch(() => {});
    const cleanup = window.electron.onPrinterModeChanged((data) => {
      setPrinterMode({ mode: data.mode, targetLabel: data.targetLabel || '' });
    });
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, []);

  // ── v3.0 Coordinateur ──
  useEffect(() => {
    window.electron.coordStatus().then(res => { if (res?.success) setCoordStatus(res); }).catch(() => {});
    const cleanup = window.electron.onCoordStatusChanged((data) => setCoordStatus(data));
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, []);

  // ── v4.1.0 Badge messages non lus ──
  useEffect(() => {
    const refresh = () => window.electron.chatUnreadCount().then(r => { if (r?.success) setUnreadChat(r.count); }).catch(()=>{});
    refresh();
    const interval = setInterval(refresh, 5000);
    const cleanup = window.electron.onChatMessage(() => refresh());
    return () => { clearInterval(interval); if (typeof cleanup === 'function') cleanup(); };
  }, []);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (isAdmin) {
      checkStockAlertas();
      const setShiftStart = async () => {
        const existing = await window.electron.storeGet(`shift_start_${user.id}`);
        if (!existing) await window.electron.storeSet(`shift_start_${user.id}`, new Date().toISOString());
      };
      setShiftStart();
    }
  }, []);

  const checkStockAlertas = async () => {
    const res = await window.electron.dbQuery(
      "SELECT nom, stock_cartons, stock_alerte FROM products WHERE actif=1 AND stock_cartons <= stock_alerte", []
    );
    const alertas = res.data || [];
    setStockAlertas(alertas);
    if (alertas.length > 0) setShowAlertPopup(true);
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('nav','dashboard'), end: true },
    { to: '/caisse', icon: ShoppingCart, label: t('nav','cashier') },
    ...(isAdmin ? [
      { to: '/products', icon: Package, label: t('nav','products') },
      { to: '/estoque', icon: Warehouse, label: t('nav','stock'), badge: stockAlertas.length },
      { to: '/users', icon: Users, label: t('nav','users') },
    ] : []),
    { to: '/historique', icon: History, label: t('nav','history') },
    { to: '/caderno', icon: BookOpen, label: t('nav','caderno') },
    { to: '/messaging', icon: MessageSquare, label: t('messaging','title') || 'Mensagens', badge: unreadChat },
    ...(isAdmin ? [{ to: '/settings', icon: Settings, label: t('nav','settings') }] : []),
    ...(isAdmin ? [{ to: '/coord', icon: Monitor, label: 'Coord' }] : []),
    ...(isAdmin ? [{ to: '/audit', icon: ClipboardList, label: 'Audit' }] : []),
  ];

  const handleSync = async () => {
    setSyncing(true);
    try { await window.electron.driveSync(); } catch (e) {}
    setSyncing(false);
  };

  const handleLogoutClick = () => setShowShift(true);
  const handleShiftConfirm = async () => { setShowShift(false); await logout(); navigate('/login'); };
  const handleShiftCancel = () => setShowShift(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Titlebar */}
      <div className="titlebar">
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2 }}>
          CKB<span style={{ color: 'var(--text-secondary)' }}>POS</span>
        </span>
        <div style={{ flex: 1, textAlign: 'center' }}>
          {clock && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 600, letterSpacing: 1 }}>
              {clock}
            </span>
          )}
        </div>

        {/* ── v1.5.0 Indicateur sync ── */}
        {(() => {
          const CFG = {
            synced:  { color: 'var(--success)', dot: '#22c55e', label: 'Synced'   },
            syncing: { color: 'var(--accent)',  dot: '#e8c547', label: 'Syncing\u2026' },
            pending: { color: '#f97316',        dot: '#f97316', label: `${syncSt.pending} pend.` },
            offline: { color: 'var(--danger)',  dot: '#ef4444', label: 'Offline'  },
            idle:    { color: 'var(--text-muted)', dot: '#444', label: ''         },
          };
          const c = CFG[syncSt.status] || CFG.idle;
          if (!c.label) return null;
          return (
            <div
              title={`Sync: ${syncSt.status} — ${syncSt.pending || 0} pend. — ${syncSt.online || 0} pairs`}
              onClick={() => window.electron.syncForce()}
              style={{ display:'flex', alignItems:'center', gap:5, marginRight:12, cursor:'pointer', padding:'2px 8px', borderRadius:4, background: c.dot + '14', border:`1px solid ${c.dot}33` }}
            >
              <span style={{ width:6, height:6, borderRadius:'50%', background:c.dot, flexShrink:0, animation: syncSt.status==='syncing' ? 'pulse 1s infinite' : 'none' }} />
              <span style={{ fontSize:10, color:c.color, fontFamily:'monospace', fontWeight:600, whiteSpace:'nowrap' }}>{c.label}</span>
            </div>
          );
        })()}

        {/* ── v1.7.0 Indicateur cloud Supabase ── */}
        {(() => {
          const CCFG = {
            connected:      { color:'#22c55e', dot:'#22c55e', label:'\u2601\uFE0F Synced'      },
            syncing:        { color:'#e8c547', dot:'#e8c547', label:'\u2601\uFE0F Syncing\u2026' },
            error:          { color:'#ef4444', dot:'#ef4444', label:'\u2601\uFE0F Error'        },
            disconnected:   { color:'#555',    dot:'#444',    label:null                        },
            not_configured: { color:'#555',    dot:'#444',    label:null                        },
            connecting:     { color:'#60a5fa', dot:'#60a5fa', label:'\u2601\uFE0F Connecting\u2026' },
          };
          const cc = CCFG[cloudSt.status] || CCFG.disconnected;
          if (!cc.label) return null;
          return (
            <div
              title={'Cloud: ' + cloudSt.status + (cloudSt.error ? ' — ' + cloudSt.error : '') + (cloudSt.lastSync ? ' — ' + cloudSt.lastSync : '')}
              onClick={() => cloudSt.status === 'connected' ? window.electron.cloudPush() : null}
              style={{ display:'flex', alignItems:'center', gap:5, marginRight:8, cursor: cloudSt.status==='connected'?'pointer':'default', padding:'2px 8px', borderRadius:4, background:cc.dot+'14', border:`1px solid ${cc.dot}33` }}
            >
              <span style={{ width:6, height:6, borderRadius:'50%', background:cc.dot, flexShrink:0, animation:cloudSt.status==='syncing'||cloudSt.status==='connecting'?'pulse 1s infinite':'none' }}/>
              <span style={{ fontSize:10, color:cc.color, fontFamily:'monospace', fontWeight:600, whiteSpace:'nowrap' }}>{cc.label}</span>
            </div>
          );
        })()}

        <div className="titlebar-controls">
          {/* ── v3.0 Badge coordinateur ── */}
          {coordStatus.isCoordinator && (
            <div
              title="Esta máquina é o Coordenador da rede"
              style={{ display:'flex', alignItems:'center', gap:4, marginRight:6, padding:'2px 8px', borderRadius:4, background:'rgba(99,179,237,0.12)', border:'1px solid rgba(99,179,237,0.35)' }}
            >
              <span style={{ fontSize:10 }}>{'\u2B50'}</span>
              <span style={{ fontSize:10, color:'#63b3ed', fontFamily:'monospace', fontWeight:600 }}>COORD</span>
            </div>
          )}
          {/* ── v3.1 Badge mode dégradé ── */}
          {coordStatus.degraded && !coordStatus.isCoordinator && (
            <div
              title="Coordenador ausente — modo degradado ativo"
              style={{ display:'flex', alignItems:'center', gap:4, marginRight:6, padding:'2px 8px', borderRadius:4, background:'rgba(245,101,101,0.12)', border:'1px solid rgba(245,101,101,0.35)' }}
            >
              <span style={{ fontSize:10 }}>{'\u26A0'}{'\uFE0F'}</span>
              <span style={{ fontSize:10, color:'#fc8181', fontFamily:'monospace', fontWeight:600 }}>DEGRADADO</span>
            </div>
          )}
          {/* ── v1.9.1 Indicateur impression partagée ── */}
          {printerMode.mode === 'shared' && printerMode.targetLabel && (
            <div
              title={'Impressão partilhada \u2192 ' + printerMode.targetLabel}
              style={{ display:'flex', alignItems:'center', gap:4, marginRight:10, padding:'2px 8px', borderRadius:4, background:'rgba(232,197,71,0.1)', border:'1px solid rgba(232,197,71,0.3)' }}
            >
              <span style={{ fontSize:11 }}>{'\u{1F5A8}'}{'\uFE0F'}</span>
              <span style={{ fontSize:10, color:'#e8c547', fontFamily:'monospace', fontWeight:600, whiteSpace:'nowrap' }}>
                {'\u2192 ' + printerMode.targetLabel}
              </span>
            </div>
          )}
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="titlebar-btn" onClick={() => window.electron.minimize()}><Minus size={14} /></motion.button>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="titlebar-btn" onClick={() => window.electron.maximize()}><Square size={12} /></motion.button>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="titlebar-btn close" onClick={() => window.electron.close()}><X size={14} /></motion.button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <motion.aside
          variants={sidebarVariants}
          animate={collapsed ? 'collapsed' : 'expanded'}
          style={{
            background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
          }}
        >
          <div style={{ padding: collapsed ? '16px 12px' : '16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            <motion.div
              whileHover={{ scale: 1.08 }}
              style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 700, fontSize: 14, flexShrink: 0, overflow: 'hidden', background: 'var(--accent-dim)' }}
            >
              {user?.photo_base64 ? (
                <img src={user.photo_base64} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}/>
              ) : (
                user?.nom?.[0]?.toUpperCase()
              )}
            </motion.div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  variants={navLabelVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.nom}</div>
                  <span className={`badge badge-${user?.role}`} style={{ fontSize: 10 }}>{user?.role}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
            {navItems.map(({ to, icon: Icon, label, end, badge }) => (
              <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '10px' : '10px 12px', borderRadius: 8, textDecoration: 'none',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                fontWeight: isActive ? 600 : 400, fontSize: 14,
                transition: 'color 0.15s ease, background 0.15s ease',
                justifyContent: collapsed ? 'center' : 'flex-start',
                whiteSpace: 'nowrap', overflow: 'hidden', position: 'relative',
              })}>
                {({ isActive }) => (
                  <motion.span
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}
                    whileHover={{ x: collapsed ? 0 : 3 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                  >
                    <Icon size={18} style={{ flexShrink: 0 }} />
                    <AnimatePresence>
                      {!collapsed && (
                        <motion.span
                          variants={navLabelVariants}
                          initial="hidden"
                          animate="visible"
                          exit="hidden"
                          style={{ flex: 1 }}
                        >
                          {label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {badge > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        style={{ marginLeft: 'auto', background: 'var(--danger)', color: 'white', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}
                      >
                        {badge}
                      </motion.span>
                    )}
                  </motion.span>
                )}
              </NavLink>
            ))}
          </nav>

          <div style={{ padding: '8px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {isAdmin && (
              <motion.button
                whileHover={{ x: collapsed ? 0 : 3 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleSync}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '10px' : '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'inherit', justifyContent: collapsed ? 'center' : 'flex-start', width: '100%' }}
              >
                <RefreshCw size={18} className={syncing ? 'spin' : ''} style={{ flexShrink: 0 }} />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span variants={navLabelVariants} initial="hidden" animate="visible" exit="hidden" style={{ fontSize: 13 }}>
                      {syncing ? t('nav','syncing') : t('nav','syncDrive')}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            )}
            <motion.button
              whileHover={{ x: collapsed ? 0 : 3 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setShowConsole(s => !s); setHasError(false); }}
              style={{ display:'flex', alignItems:'center', gap:10, padding:collapsed?'10px':'10px 12px', borderRadius:8, border:'none', cursor:'pointer', background:showConsole?'var(--accent)22':hasError?'rgba(239,68,68,0.08)':'transparent', color:showConsole?'var(--accent)':hasError?'var(--danger)':'var(--text-secondary)', fontSize:14, fontFamily:'inherit', justifyContent:collapsed?'center':'flex-start', width:'100%', transition:'background 0.2s, color 0.2s', position:'relative' }}
            >
              <span style={{ position:'relative', flexShrink:0 }}>
                <Terminal size={18} />
                {hasError && !showConsole && (
                  <span style={{ position:'absolute', top:-3, right:-3, width:6, height:6, borderRadius:'50%', background:'var(--danger)' }} />
                )}
              </span>
              <AnimatePresence>
                {!collapsed && (
                  <motion.span variants={navLabelVariants} initial="hidden" animate="visible" exit="hidden" style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
                    Console
                    {consoleLogs.length > 0 && (
                      <span style={{ fontSize:9, background:'var(--bg-hover)', color:'var(--text-muted)', borderRadius:4, padding:'1px 5px', fontFamily:'monospace' }}>
                        {consoleLogs.length}
                      </span>
                    )}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
            <motion.button
              whileHover={{ x: collapsed ? 0 : 3 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setCollapsed(!collapsed)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '10px' : '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'inherit', justifyContent: collapsed ? 'center' : 'flex-start', width: '100%' }}
            >
              <motion.span animate={{ rotate: collapsed ? 0 : 180 }} transition={{ duration: 0.25 }}>
                <ChevronRight size={18} />
              </motion.span>
              <AnimatePresence>
                {!collapsed && (
                  <motion.span variants={navLabelVariants} initial="hidden" animate="visible" exit="hidden">
                    {t('nav','collapse')}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
            <motion.button
              whileHover={{ x: collapsed ? 0 : 3 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleLogoutClick}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '10px' : '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--danger)', fontSize: 14, fontFamily: 'inherit', justifyContent: collapsed ? 'center' : 'flex-start', width: '100%' }}
            >
              <LogOut size={18} style={{ flexShrink: 0 }} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span variants={navLabelVariants} initial="hidden" animate="visible" exit="hidden">
                    {t('nav','logout')}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </motion.aside>

        {/* Main content with page transitions */}
        <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {/* v4.9.5 — Banner d'expiration licence (J-7/J-3/J-1) */}
          <ExpirationBanner />
          <AnimatePresence mode="sync">
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ── v4.9.0 Auto-update banner ── */}
      <UpdateBanner />

      {/* ── v3.7.0 Toast notification sync ── */}
      {syncToast && (
        <div key={syncToast.key} style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: 'var(--bg-card)', border: '1px solid rgba(34,197,94,0.4)',
          borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600,
          color: 'var(--text-primary)', boxShadow: 'var(--shadow)',
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'fadeInUp 0.25s ease',
        }}>
          {syncToast.msg}
        </div>
      )}

      {/* Stock Alert Popup */}
      <AnimatePresence>
        {showAlertPopup && stockAlertas.length > 0 && (
          <motion.div
            className="modal-overlay"
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <motion.div
              className="modal"
              variants={alertVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ maxWidth: 420 }}
            >
              <div className="modal-header">
                <h2 className="modal-title" style={{ color: 'var(--danger)' }}>
                  <AlertTriangle size={18} style={{ display: 'inline', marginRight: 8 }} />{'\u26A0'}{'\uFE0F'} Estoque Baixo!
                </h2>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setShowAlertPopup(false)} className="btn btn-icon btn-secondary"><X size={16} /></motion.button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                Os seguintes produtos estão abaixo do nível de alerta:
              </p>
              {stockAlertas.map((p, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.2 }}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, marginBottom: 8, fontSize: 13 }}
                >
                  <span style={{ fontWeight: 600 }}>{p.nom}</span>
                  <span style={{ color: 'var(--danger)', fontFamily: 'monospace' }}>
                    {Math.round(p.stock_cartons * 100) / 100} / {p.stock_alerte} cartons
                  </span>
                </motion.div>
              ))}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => setShowAlertPopup(false)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>{t('alert','close')}</motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => { setShowAlertPopup(false); navigate('/estoque'); }} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {t('alert','viewStock')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Console in-app v1.4.1 ── */}
      <AnimatePresence>
        {showConsole && (
          <motion.div
            initial={{ y: 280, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 280, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ position:'fixed', bottom:0, left:0, right:0, height:268, background: theme==='dark'?'#080808':'#f0f0f0', borderTop:'2px solid var(--accent)', zIndex:998, display:'flex', flexDirection:'column', fontFamily:'monospace' }}
          >
            {/* Header */}
            <div style={{ padding:'5px 14px', borderBottom:`1px solid ${theme==='dark'?'#1e1e1e':'#d0d0d0'}`, display:'flex', alignItems:'center', gap:10, flexShrink:0, background: theme==='dark'?'#0a0a0a':'#e4e4e4' }}>
              <Terminal size={13} color="var(--accent)" />
              <span style={{ fontSize:11, fontWeight:700, color:'var(--accent)', letterSpacing:'1px' }}>CONSOLE</span>
              <span style={{ fontSize:10, color: theme==='dark'?'#444':'#888' }}>{consoleLogs.length} logs</span>
              <span style={{ fontSize:9, color: theme==='dark'?'#333':'#999', marginLeft:4 }}>Ctrl+`</span>
              <div style={{ flex:1 }} />
              {/* Filtres */}
              {/* Onglet LOGS */}
              <button onClick={() => setConsoleTab('logs')} style={{ background:consoleTab==='logs'?'var(--accent)':'transparent', color:consoleTab==='logs'?'#000':'#555', border:`1px solid ${consoleTab==='logs'?'var(--accent)':'#2a2a2a'}`, borderRadius:3, padding:'2px 8px', fontSize:9, cursor:'pointer', fontFamily:'monospace', fontWeight:700, letterSpacing:'0.5px' }}>
                LOGS
              </button>
              {/* Onglet SQL */}
              <button onClick={() => setConsoleTab('sql')} style={{ background:consoleTab==='sql'?'#a78bfa':'transparent', color:consoleTab==='sql'?'#000':'#555', border:`1px solid ${consoleTab==='sql'?'#a78bfa':'#2a2a2a'}`, borderRadius:3, padding:'2px 8px', fontSize:9, cursor:'pointer', fontFamily:'monospace', fontWeight:700, letterSpacing:'0.5px' }}>
                SQL
              </button>
              {/* Filtres logs (visibles seulement en mode LOGS) */}
              {consoleTab === 'logs' && ['ALL','LAN','SYNC','ERROR'].map(f => (
                <button key={f} onClick={() => setConsoleFilter(f)} style={{ background:consoleFilter===f?'var(--accent)':'transparent', color:consoleFilter===f?'#000':'#555', border:`1px solid ${consoleFilter===f?'var(--accent)':'#2a2a2a'}`, borderRadius:3, padding:'2px 8px', fontSize:9, cursor:'pointer', fontFamily:'monospace', fontWeight:700, letterSpacing:'0.5px', transition:'all 0.15s' }}>
                  {f}
                </button>
              ))}
              {consoleTab === 'logs' && (
                <button onClick={() => setConsoleLogs([])} style={{ background:'transparent', border:'1px solid #2a2a2a', color:'#555', borderRadius:3, padding:'2px 8px', fontSize:9, cursor:'pointer', fontFamily:'monospace', marginLeft:4 }}>
                  CLEAR
                </button>
              )}
              <button onClick={() => setShowConsole(false)} style={{ background:'transparent', border:'none', color:'#555', cursor:'pointer', fontSize:16, lineHeight:1, padding:'0 4px', marginLeft:4 }}>
                ×
              </button>
            </div>

            {/* ── Corps : LOGS ── */}
            {consoleTab === 'logs' && (
              <div style={{ flex:1, overflowY:'auto', padding:'4px 0' }}>
                {(() => {
                  const TAG_COLOR = { '[LAN]':'#60a5fa','[SYNC]':'#f59e0b','[BEAT]':'#f97316','[BOOT]':'#e8c547','[DB]':'#a78bfa','[IPC]':'#9ca3af','[LOG]':'#6b7280','[CKBPOS]':'#e8c547' };
                  const filtered = consoleFilter === 'ALL'   ? consoleLogs
                                 : consoleFilter === 'ERROR' ? consoleLogs.filter(l => l.level === 'error')
                                 : consoleLogs.filter(l => l.tag === `[${consoleFilter}]`);
                  if (filtered.length === 0) return (
                    <div style={{ color:'#2a2a2a', fontSize:11, paddingTop:24, textAlign:'center' }}>
                      {consoleLogs.length === 0 ? 'Aguardando logs…' : 'Nenhum log para este filtro'}
                    </div>
                  );
                  return filtered.map((log, i) => {
                    const tc = TAG_COLOR[log.tag] || '#6b7280';
                    const mc = log.level==='error'?'#ef4444':log.level==='warn'?'#fbbf24':log.level==='success'?'#22c55e':'#888';
                    return (
                      <div key={i} style={{ display:'flex', gap:10, fontSize:11, lineHeight:'1.85', padding:'0 14px', borderBottom:'1px solid #0f0f0f' }}>
                        <span style={{ color:'#2e2e2e', flexShrink:0, width:64 }}>{log.time}</span>
                        <span style={{ color:tc, background:tc+'18', padding:'0 5px', borderRadius:2, flexShrink:0, minWidth:52, textAlign:'center', fontWeight:700, fontSize:10 }}>{log.tag}</span>
                        <span style={{ color:mc, flex:1, wordBreak:'break-all' }}>{log.msg}</span>
                      </div>
                    );
                  });
                })()}
                <div ref={consoleEndRef} />
              </div>
            )}

            {/* ── Corps : SQL ── */}
            {consoleTab === 'sql' && (
              <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                {/* Input SQL */}
                <div style={{ display:'flex', gap:6, padding:'6px 10px', borderBottom:'1px solid #1a1a1a', flexShrink:0 }}>
                  <textarea
                    value={sqlInput}
                    onChange={e => setSqlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); runSql(); } }}
                    placeholder="SELECT * FROM ventes LIMIT 10;"
                    rows={2}
                    style={{ flex:1, background:'#111', border:'1px solid #2a2a2a', color:'#a78bfa', borderRadius:4, padding:'4px 8px', fontFamily:'monospace', fontSize:11, resize:'none', outline:'none' }}
                  />
                  <button
                    onClick={() => {
                      if (!sqlInput.trim() || sqlLoading) return;
                      setSqlLoading(true); setSqlResult(null);
                      window.electron.devSqlQuery(sqlInput.trim())
                        .then(r => setSqlResult(r))
                        .catch(e => setSqlResult({ success:false, error: e.message }))
                        .finally(() => setSqlLoading(false));
                    }}
                    style={{ background:'#a78bfa22', border:'1px solid #a78bfa', color:'#a78bfa', borderRadius:4, padding:'0 14px', fontSize:10, fontFamily:'monospace', fontWeight:700, cursor:'pointer', flexShrink:0, letterSpacing:'0.5px' }}
                  >
                    {sqlLoading ? '…' : t('devConsole','runBtn')}
                    <span style={{ display:'block', fontSize:8, color:'#555', fontWeight:400 }}>Ctrl+Enter</span>
                  </button>
                  <button onClick={() => setSqlResult(null)} style={{ background:'transparent', border:'1px solid #2a2a2a', color:'#444', borderRadius:4, padding:'0 8px', fontSize:9, cursor:'pointer', fontFamily:'monospace' }}>{t('devConsole','clearBtn')}</button>
                </div>
                {/* Résultats */}
                <div style={{ flex:1, overflowY:'auto', overflowX:'auto', padding:'4px 0' }}>
                  {!sqlResult && !sqlLoading && (
                    <div style={{ color:'#2a2a2a', fontSize:11, paddingTop:20, textAlign:'center', fontFamily:'monospace' }}>{t('devConsole','cmdHint')}</div>
                  )}
                  {sqlLoading && (
                    <div style={{ color:'#a78bfa', fontSize:11, paddingTop:20, textAlign:'center', fontFamily:'monospace' }}>{t('devConsole','running')}</div>
                  )}
                  {sqlResult && !sqlResult.success && (
                    <div style={{ color:'#ef4444', fontSize:11, padding:'8px 14px', fontFamily:'monospace' }}>{'\u274C'} {sqlResult.error}</div>
                  )}
                  {sqlResult && sqlResult.success && sqlResult.rows.length === 0 && (
                    <div style={{ color:'#22c55e', fontSize:11, padding:'8px 14px', fontFamily:'monospace' }}>{'\u2705'} {sqlResult.info || `0 lignes — ${sqlResult.count} changes`}</div>
                  )}
                  {sqlResult && sqlResult.success && sqlResult.rows.length > 0 && (() => {
                    const cols = Object.keys(sqlResult.rows[0]);
                    return (
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10, fontFamily:'monospace' }}>
                        <thead>
                          <tr style={{ background:'#111', position:'sticky', top:0 }}>
                            {cols.map(c => <th key={c} style={{ padding:'3px 10px', color:'#a78bfa', borderBottom:'1px solid #2a2a2a', textAlign:'left', fontWeight:700, whiteSpace:'nowrap' }}>{c}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {sqlResult.rows.map((row, i) => (
                            <tr key={i} style={{ background: i%2===0?'transparent': theme==='dark'?'#0d0d0d':'#e8e8e8' }}>
                              {cols.map(c => <td key={c} style={{ padding:'2px 10px', color:'#888', borderBottom:'1px solid #0f0f0f', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row[c] === null ? <span style={{color:'#333'}}>NULL</span> : String(row[c])}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                  {sqlResult && sqlResult.success && sqlResult.rows.length > 0 && (
                    <div style={{ color:'#444', fontSize:9, padding:'4px 14px', fontFamily:'monospace' }}>{sqlResult.count} ligne(s)</div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showShift && <ShiftModal isAdmin={isAdmin} onConfirm={handleShiftConfirm} onCancel={handleShiftCancel} />}
      </AnimatePresence>
    </div>
  );
}
