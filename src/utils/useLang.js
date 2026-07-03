import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import translations from './translations';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState('pt-BR');
  const [currency, setCurrency] = useState('AOA');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const langRes = await window.electron.dbGet(
          "SELECT value FROM settings WHERE key='app_language'"
        );
        if (langRes?.data?.value) {
          setLang(langRes.data.value);
        } else {
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

  const changeLang = useCallback(async (newLang) => {
    setLang(newLang);
    try {
      await window.electron.dbQuery(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('app_language', ?)",
        [newLang]
      );
      await window.electron.storeSet('app_language', newLang);
    } catch (e) {
      console.error('changeLang error:', e);
    }
  }, []);

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

  const t = useCallback((section, key) => {
    try {
      const val = translations[lang]?.[section]?.[key];
      if (val !== undefined) return val;
      // Fallback pt-BR
      const fallback = translations['pt-BR']?.[section]?.[key];
      if (fallback !== undefined) return fallback;
      // Rien trouvé — log pour debug
      console.warn(`[t] MISSING: [${lang}][${section}][${key}]`);
      return key;
    } catch (e) {
      return key;
    }
  }, [lang]);

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
