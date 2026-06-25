import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { LangProvider, useLang } from './utils/useLang';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import CaissePage from './pages/CaissePage';
import HistoriquePage from './pages/HistoriquePage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import EstoquePage from './pages/EstoquePage';
import CadernoPage from './pages/CadernoPage';
import CoordDashboardPage from './pages/CoordDashboardPage';
import AuditLogPage from './pages/AuditLogPage';
import MessagingPage from './pages/MessagingPage';
import LicensePage from './pages/LicensePage';
import Layout from './components/Layout';
import './styles/global.css';

export const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

export const ThemeContext = createContext(null);
export function useTheme() { return useContext(ThemeContext); }

// ── Contexte licence (partage l'état entre App, Layout, LicensePage) ──
export const LicenseContext = createContext(null);
export function useLicense() { return useContext(LicenseContext); }

// ── LicenseWatcher : écoute les mises à jour de ventes + reception realtime ──
// Re-verifie le statut licence sans navigation imperative (redirection declarative dans les routes)
function LicenseWatcher({ refreshLicense }) {
  useEffect(() => {
    const cleanup1 = window.electron.onLicenseSalesUpdated(() => refreshLicense());
    const cleanup2 = window.electron.onLicenseReceived(() => refreshLicense());
    return () => {
      if (typeof cleanup1 === 'function') cleanup1();
      if (typeof cleanup2 === 'function') cleanup2();
    };
  }, [refreshLicense]);
  return null;
}

// ── Banner d'expiration imminente (J-7 / J-3 / J-1) ──
function ExpirationBanner() {
  const { license } = useLicense();
  const { t } = useLang();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (!license?.payload?.expires_at || dismissed) return null;

  const days = Math.ceil((new Date(license.payload.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days > 7 || days < 0) return null;

  // 3 niveaux : J-1/J-0 urgence rouge, J-2/J-3 avertissement orange, J-4..J-7 info doré
  let level, key;
  if (days <= 1)      { level = 'urgent';   key = 'expireUrgent'; }
  else if (days <= 3) { level = 'warning';  key = 'expireWarning'; }
  else                { level = 'soon';     key = 'expireSoon'; }

  const msg = t('licensing', key).replace('{days}', String(days));

  return (
    <div className={`license-banner license-banner-${level}`}>
      <span className="license-banner-msg">{msg}</span>
      <div className="license-banner-actions">
        <button className="license-banner-btn" onClick={() => navigate('/license')}>
          {t('licensing', 'viewLicense')}
        </button>
        <button className="license-banner-dismiss" onClick={() => setDismissed(true)}>
          {t('licensing', 'dismiss')}
        </button>
      </div>
    </div>
  );
}

export { ExpirationBanner };

// ── Raccourcis clavier globaux ────────────────────────────────
function KeyboardShortcuts({ user }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!user) return;
    const handler = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isInput = ['input','textarea','select'].includes(tag);
      if (e.ctrlKey && e.key === 'e') { e.preventDefault(); window.electron.close(); return; }
      if (e.ctrlKey && e.key === 'q') { e.preventDefault(); window.electron.minimize(); return; }
      if (e.ctrlKey && e.key === 'w') { e.preventDefault(); window.electron.maximize(); return; }
      if (isInput && e.key !== 'Escape') return;
      switch(e.key) {
        case 'F1': e.preventDefault(); navigate('/'); break;
        case 'F2': e.preventDefault(); navigate('/caisse'); break;
        case 'F3': e.preventDefault(); if (user.role==='admin') navigate('/products'); break;
        case 'F4': e.preventDefault(); if (user.role==='admin') navigate('/estoque'); break;
        case 'F5': e.preventDefault(); if (user.role==='admin') navigate('/users'); break;
        case 'F6': e.preventDefault(); navigate('/historique'); break;
        case 'F7': e.preventDefault(); navigate('/caderno'); break;
        case 'F8': e.preventDefault(); if (user.role==='admin') navigate('/settings'); break;
        // v3.5.0 — F9 → Dashboard Coordenador (admin only)
        case 'F9': e.preventDefault(); if (user.role==='admin') navigate('/coord'); break;
        case 'Escape': {
          const overlay = document.querySelector('.modal-overlay');
          if (overlay) {
            const closeBtn = overlay.querySelector('button.btn-secondary, button[class*="btn-secondary"]');
            if (closeBtn) closeBtn.click();
          }
          break;
        }
        default: break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [user, navigate]);
  return null;
}

function App() {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme]     = useState('dark');
  // v3.4 — état setup
  const [isSetup, setIsSetup] = useState(true); // true = déjà configuré (optimiste)
  // v4.9.5 — état licence
  const [license, setLicense] = useState(null);
  const [licenseChecked, setLicenseChecked] = useState(false);

  // ── Refresh licence : appelle license-status et met à jour l'état React ──
  const refreshLicense = useCallback(async () => {
    try {
      const res = await window.electron.licenseStatus();
      if (res?.ok) {
        setLicense({
          valid: !!res.data?.valid,
          reason: res.data?.reason,
          salesUsed: res.data?.salesUsed || 0,
          payload: res.data?.payload || null,
        });
      }
    } catch (_e) {
      // silencieux — pas de crash si IPC indisponible
    }
    setLicenseChecked(true);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        // 1. Vérifier si setup fait
        const setupRes = await window.electron.checkSetup();
        setIsSetup(setupRes?.isSetup === true);

        // 2. Thème
        const savedTheme = await window.electron.storeGet('app_theme');
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setTheme(savedTheme);
          document.documentElement.setAttribute('data-theme', savedTheme);
        }

        // 3. Remember session — restaurer user si activé
        if (setupRes?.isSetup) {
          const remRes = await window.electron.getRememberSession();
          if (remRes?.remember) {
            const savedUser = await window.electron.storeGet('current_user');
            if (savedUser) setUser(savedUser);
          }
        }

        // 4. Licence — charger le statut au démarrage
        await refreshLicense();
      } catch(e) {}
      setLoading(false);
    };
    init();

    // Effacer session au beforeunload sauf si remember activé
    const handleBeforeUnload = async () => {
      try {
        const remRes = await window.electron.getRememberSession();
        if (!remRes?.remember) await window.electron.storeDelete('current_user');
      } catch(e) {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [refreshLicense]);

  const toggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { await window.electron.storeSet('app_theme', next); } catch(e) {}
  };

  const login = async (userData) => {
    setUser(userData);
    await window.electron.storeSet('current_user', userData);
  };

  const logout = async () => {
    setUser(null);
    await window.electron.storeDelete('current_user');
    // Désactiver remember session au logout explicite
    try { await window.electron.setRememberSession(false); } catch(e) {}
  };

  // v3.4 — appelé par SetupPage quand le wizard est terminé
  const onSetupDone = async (userData) => {
    setIsSetup(true);
    if (userData) {
      setUser(userData);
      await window.electron.storeSet('current_user', userData);
    }
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0a0a', color:'#e8c547', fontSize:24, fontFamily:'monospace', letterSpacing:4 }}>
      CKBPOS...
    </div>
  );

  // v4.9.5 — Accès licence : licence valide OU mode FREE avec < 30 ventes
  // Si pas encore vérifié (licenseChecked=false), on ne bloque pas (évite flash /license au démarrage)
  const hasLicenseAccess = !licenseChecked ? true
    : license?.valid ? true
    : (license?.payload == null) && (license?.salesUsed || 0) < 30;

  return (
    <LangProvider>
      <ThemeContext.Provider value={{ theme, toggleTheme }}>
        <AuthContext.Provider value={{ user, login, logout }}>
          <LicenseContext.Provider value={{ license, refreshLicense }}>
            <Router>
              <KeyboardShortcuts user={user}/>
              <LicenseWatcher refreshLicense={refreshLicense}/>
              <Routes>
                {/* v3.4 — Setup première fois */}
                <Route path="/setup" element={!isSetup ? <SetupPage onDone={onSetupDone}/> : <Navigate to="/"/>} />
                <Route path="/login" element={
                  !isSetup ? <Navigate to="/setup"/> :
                  !user    ? <LoginPage/> :
                             <Navigate to="/"/>
                }/>
                {/* v4.9.5 — Page licence (toujours accessible, même si accès bloqué) */}
                <Route path="/license" element={
                  !isSetup ? <Navigate to="/setup"/> :
                  !user    ? <Navigate to="/login"/> :
                             <LicensePage/>
                }/>
                {/* Route protégée par licence — redirection déclarative si !hasLicenseAccess */}
                <Route path="/" element={
                  !isSetup ? <Navigate to="/setup"/> :
                  !user    ? <Navigate to="/login"/> :
                  !hasLicenseAccess ? <Navigate to="/license"/> :
                             <Layout/>
                }>
                  <Route index element={<DashboardPage/>} />
                  <Route path="caisse"    element={<CaissePage/>} />
                  <Route path="products"  element={user?.role==='admin' ? <ProductsPage/>  : <Navigate to="/"/>} />
                  <Route path="estoque"   element={user?.role==='admin' ? <EstoquePage/>   : <Navigate to="/"/>} />
                  <Route path="historique"element={<HistoriquePage/>} />
                  <Route path="users"     element={user?.role==='admin' ? <UsersPage/>     : <Navigate to="/"/>} />
                  <Route path="settings"  element={user?.role==='admin' ? <SettingsPage/>  : <Navigate to="/"/>} />
                  <Route path="caderno"   element={<CadernoPage/>} />
                  {/* v3.5.0 — Dashboard Coordenador */}
                  <Route path="coord"     element={user?.role==='admin' ? <CoordDashboardPage/> : <Navigate to="/"/>} />
                  {/* v5 — Audit & Mensagens */}
                <Route path="audit"     element={user?.role==='admin' ? <AuditLogPage/> : <Navigate to="/"/>} />
                <Route path="messaging" element={<MessagingPage/>} />
              </Route>
              {/* Fallback */}
              <Route path="*" element={<Navigate to={!isSetup ? '/setup' : !user ? '/login' : !hasLicenseAccess ? '/license' : '/'}/>}/>
            </Routes>
          </Router>
          </LicenseContext.Provider>
        </AuthContext.Provider>
      </ThemeContext.Provider>
    </LangProvider>
  );
}

export default App;
