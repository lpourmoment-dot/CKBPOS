import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ptBR from './pt-BR';
import fr from './fr';
import en from './en';

type Lang = 'pt-BR' | 'fr' | 'en';
const translations = { 'pt-BR': ptBR, fr, en } as const;

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
  initLang: () => Promise<void>;
}

export const useI18n = create<I18nState>((set, get) => ({
  lang: 'pt-BR',
  setLang: (l) => {
    set({ lang: l });
    AsyncStorage.setItem('ckbpos_lang', l);
  },
  initLang: async () => {
    try {
      const stored = await AsyncStorage.getItem('ckbpos_lang');
      if (stored && (stored === 'pt-BR' || stored === 'fr' || stored === 'en')) {
        set({ lang: stored });
      }
    } catch {}
  },
}));

export function t(path: string): string {
  const lang = useI18n.getState().lang;
  const keys = path.split('.');
  let val: any = translations[lang];
  for (const k of keys) {
    val = val?.[k];
  }
  return typeof val === 'string' ? val : path;
}

export type { Lang };
