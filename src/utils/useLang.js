import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import translations from './translations';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState('pt-BR');
  const [currency, setCurrency] = useState('AOA');

  // Chargement initial : lire depuis DB settings en priorité, sinon store
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Lire depuis la base de données (source principale)
        const langRes = await window.electron.dbGet(
          "SELECT value FROM settings WHERE key='app_language'"
        );
        if (langRes?.data?.value) {
          setLang(langRes.data.value);
        } else {
          // Fallback sur le store
          const savedLang = await window.electron.storeGet('app_language');
          if (savedLang) setLang(savedLang);
        }

        const currRes = await window.electron.dbGet(
          "SELECT value FROM settings WHERE key='currency'"
        );
        if (currRes?.data?.value) {
          setCurrency(currRes.data.value);
        } else {
          const savedCurrency = await window.electron.storeGet('app_currency');
          if (savedCurrency) setCurrency(savedCurrency);
        }
      } catch (e) {
        console.error('useLang loadSettings error:', e);
      }
    };
    loadSettings();
  }, []);

  // Changer la langue : mise à jour immédiate + persistance DB + store
  const changeLang = useCallback(async (newLang) => {
    // Mise à jour immédiate de l'état React (UI change instantanément)
    setLang(newLang);
    try {
      // Sauvegarder dans la DB settings
      await window.electron.dbQuery(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('app_language', ?)",
        [newLang]
      );
      // Sauvegarder aussi dans le store (backup)
      await window.electron.storeSet('app_language', newLang);
    } catch (e) {
      console.error('changeLang error:', e);
    }
  }, []);

  // Changer la devise : mise à jour immédiate + persistance
  const changeCurrency = useCallback(async (newCurrency) => {
    setCurrency(newCurrency);
    try {
      await window.electron.dbQuery(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('currency', ?)",
        [newCurrency]
      );
      await window.electron.storeSet('app_currency', newCurrency);
    } catch (e) {
      console.error('changeCurrency error:', e);
    }
  }, []);

  // Fonction de traduction avec fallback pt-BR
  const t = useCallback((section, key) => {
    try {
      const val = translations[lang]?.[section]?.[key];
      if (val !== undefined) return val;
      // Fallback sur pt-BR
      return translations['pt-BR']?.[section]?.[key] || key;
    } catch (e) {
      return key;
    }
  }, [lang]);

  // Formater un montant
  const fmt = useCallback((n) => {
    return Number(n || 0).toLocaleString('fr-FR') + ' ' + currency;
  }, [currency]);

  return (
    <LangContext.Provider value={{ lang, currency, changeLang, changeCurrency, t, fmt }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
