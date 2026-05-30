import React, { useState, useEffect, createContext, useContext } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { LangProvider } from './utils/useLang';
import LoginPage from './pages/LoginPage';
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
// F1=Dashboard F2=Caisse F3=Produits F4=Estoque F5=Utilisateurs F6=Historique F7=Caderno F8=Paramètres
// Ctrl+E=Fermer Ctrl+Q=Réduire Ctrl+W=Agrandir/rétrécir Echap=fermer modal
function KeyboardShortcuts({ user }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!user) return;
    const handler = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isInput = ['input','textarea','select'].includes(tag);

      // ── Ctrl+E : Fermer l'app ──
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault(); window.electron.close(); return;
      }
      // ── Ctrl+Q : Réduire ──
      if (e.ctrlKey && e.key === 'q') {
        e.preventDefault(); window.electron.minimize(); return;
      }
      // ── Ctrl+W : Agrandir/rétrécir (toggle) ──
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault(); window.electron.maximize(); return;
      }

      // Ignorer les touches Fn si focus sur input (sauf Echap)
      if (isInput && e.key !== 'Escape') return;

      switch(e.key) {
        case 'F1': e.preventDefault(); navigate('/'); break;                                   // Dashboard
        case 'F2': e.preventDefault(); navigate('/caisse'); break;                             // Caisse
        case 'F3': e.preventDefault(); if (user.role==='admin') navigate('/products'); break;  // Produits
        case 'F4': e.preventDefault(); if (user.role==='admin') navigate('/estoque'); break;   // Estoque
        case 'F5': e.preventDefault(); if (user.role==='admin') navigate('/users'); break;     // Utilisateurs
        case 'F6': e.preventDefault(); navigate('/historique'); break;                         // Historique
        case 'F7': e.preventDefault(); navigate('/caderno'); break;                            // Caderno
        case 'F8': e.preventDefault(); if (user.role==='admin') navigate('/settings'); break;  // Paramètres
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const checkSession = async () => {
      try {
        const savedUser = await window.electron.storeGet('current_user');
        if (savedUser) setUser(savedUser);
        const savedTheme = await window.electron.storeGet('app_theme');
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setTheme(savedTheme);
          document.documentElement.setAttribute('data-theme', savedTheme);
        }
      } catch(e) {}
      setLoading(false);
    };
    checkSession();
    const handleBeforeUnload = async () => {
      try { await window.electron.storeDelete('current_user'); } catch(e) {}
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
            {/* ✅ Raccourcis clavier globaux — F1-F8 + Echap */}
            <KeyboardShortcuts user={user}/>
            <Routes>
              <Route path="/login" element={!user?<LoginPage/>:<Navigate to="/"/>} />
              <Route path="/" element={user?<Layout/>:<Navigate to="/login"/>}>
                <Route index element={<DashboardPage/>} />
                <Route path="caisse" element={<CaissePage/>} />
                <Route path="products" element={user?.role==='admin'?<ProductsPage/>:<Navigate to="/"/>} />
                <Route path="estoque" element={user?.role==='admin'?<EstoquePage/>:<Navigate to="/"/>} />
                <Route path="historique" element={<HistoriquePage/>} />
                <Route path="users" element={user?.role==='admin'?<UsersPage/>:<Navigate to="/"/>} />
                <Route path="settings" element={user?.role==='admin'?<SettingsPage/>:<Navigate to="/"/>} />
                <Route path="caderno" element={<CadernoPage/>} />
              </Route>
            </Routes>
          </Router>
        </AuthContext.Provider>
      </ThemeContext.Provider>
    </LangProvider>
  );
}

export default App;
