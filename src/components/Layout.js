import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import { useLang } from '../utils/useLang';
import { LayoutDashboard, ShoppingCart, Package, Warehouse, History, Users, Settings, LogOut, Minus, Square, X, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ShiftModal from './ShiftModal';

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
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showShift, setShowShift] = useState(false);
  const [stockAlertas, setStockAlertas] = useState([]);
  const [showAlertPopup, setShowAlertPopup] = useState(false);
  const [clock, setClock] = useState('');

  // Horloge temps réel
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
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
    ...(isAdmin ? [{ to: '/settings', icon: Settings, label: t('nav','settings') }] : []),
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
        <div className="titlebar-controls">
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
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-dim)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 700, fontSize: 14, flexShrink: 0 }}
            >
              {user?.nom?.[0]?.toUpperCase()}
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
        <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)', position: 'relative' }}>
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
                  <AlertTriangle size={18} style={{ display: 'inline', marginRight: 8 }} />⚠️ Estoque Baixo!
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
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => setShowAlertPopup(false)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Fechar</motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => { setShowAlertPopup(false); navigate('/estoque'); }} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  Ver Estoque
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showShift && <ShiftModal isAdmin={isAdmin} onConfirm={handleShiftConfirm} onCancel={handleShiftCancel} />}
      </AnimatePresence>
    </div>
  );
}
