import { create } from 'zustand';
import { dbGet, dbRun } from '../db/sqlite';
import bcrypt from 'bcryptjs';

interface User {
  id: number;
  nom: string;
  email: string;
  role: string;
  peut_modifier_factures: number;
}

interface AuthState {
  user: User | null;
  isSetupDone: boolean;
  loginChecked: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithPin: (pin: string) => Promise<boolean>;
  logout: () => void;
  checkSetup: () => Promise<boolean>;
}

// bcrypt hash — compatible avec Desktop (bcryptjs, 10 salt rounds)
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hashSync(plain, 10);
}

// Verify bcrypt hash — compareSync gère auto le salt
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compareSync(plain, hash || '');
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isSetupDone: false,
  loginChecked: false,

  login: async (email: string, password: string) => {
    try {
      const user = await dbGet<{ id: number; nom: string; email: string; role: string; password_hash: string; peut_modifier_factures: number }>(
        'SELECT * FROM users WHERE email = ? AND actif = 1',
        [email.toLowerCase().trim()]
      );
      if (!user) return false;

      // bcrypt comparison — compatible avec les hash Desktop (bcryptjs)
      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        await dbRun(
          'UPDATE users SET tentativas_login = tentativas_login + 1 WHERE id = ?',
          [user.id]
        );
        return false;
      }

      await dbRun('UPDATE users SET tentativas_login = 0, last_login = datetime(\'now\',\'utc\') WHERE id = ?', [user.id]);
      set({ user: { id: user.id, nom: user.nom, email: user.email, role: user.role, peut_modifier_factures: user.peut_modifier_factures } });
      return true;
    } catch (e) {
      console.error('[AUTH] login error:', e);
      return false;
    }
  },

  loginWithPin: async (pin: string) => {
    try {
      const user = await dbGet<{ id: number; nom: string; email: string; role: string; pin: string; peut_modifier_factures: number }>(
        'SELECT * FROM users WHERE pin = ? AND actif = 1',
        [pin]
      );
      if (!user || !user.pin) return false;
      set({ user: { id: user.id, nom: user.nom, email: user.email, role: user.role, peut_modifier_factures: user.peut_modifier_factures } });
      return true;
    } catch (e) {
      return false;
    }
  },

  logout: () => set({ user: null }),

  checkSetup: async () => {
    try {
      const { dbGet: get } = await import('../db/sqlite');
      const done = await get<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['setup_done']);
      const machId = await get<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['machine_id']);
      const isSetup = done?.value === '1' && !!machId?.value;
      set({ isSetupDone: isSetup, loginChecked: true });
      return isSetup;
    } catch {
      set({ isSetupDone: false, loginChecked: true });
      return false;
    }
  },
}));
