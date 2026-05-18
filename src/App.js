import React, { useState, useEffect, createContext, useContext } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LangProvider } from './utils/useLang';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import CaissePage from './pages/CaissePage';
import HistoriquePage from './pages/HistoriquePage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import EstoquePage from './pages/EstoquePage';
import Layout from './components/Layout';
import './styles/global.css';

export const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

export const ThemeContext = createContext(null);
export function useTheme() { return useContext(ThemeContext); }

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const checkSession = async () => {
      try {
        const savedUser = await window.electron.storeGet('current_user');
        if (savedUser) setUser(savedUser);
        // Charger le theme sauvegardé
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
              </Route>
            </Routes>
          </Router>
        </AuthContext.Provider>
      </ThemeContext.Provider>
    </LangProvider>
  );
}

export default App;
