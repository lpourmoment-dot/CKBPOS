import React, { useState, useEffect, createContext, useContext } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { LangProvider } from './utils/useLang';
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
import Layout from './components/Layout';
import './styles/global.css';

export const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

export const ThemeContext = createContext(null);
export function useTheme() { return useContext(ThemeContext); }

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
  }, []);

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

  return (
    <LangProvider>
      <ThemeContext.Provider value={{ theme, toggleTheme }}>
        <AuthContext.Provider value={{ user, login, logout }}>
          <Router>
            <KeyboardShortcuts user={user}/>
            <Routes>
              {/* v3.4 — Setup première fois */}
              <Route path="/setup" element={!isSetup ? <SetupPage onDone={onSetupDone}/> : <Navigate to="/"/>} />
              <Route path="/login" element={
                !isSetup ? <Navigate to="/setup"/> :
                !user    ? <LoginPage/> :
                           <Navigate to="/"/>
              }/>
              <Route path="/" element={
                !isSetup ? <Navigate to="/setup"/> :
                !user    ? <Navigate to="/login"/> :
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
              </Route>
              {/* Fallback */}
              <Route path="*" element={<Navigate to={!isSetup ? '/setup' : !user ? '/login' : '/'}/>}/>
            </Routes>
          </Router>
        </AuthContext.Provider>
      </ThemeContext.Provider>
    </LangProvider>
  );
}

export default App;
