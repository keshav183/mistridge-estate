import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const Ctx = createContext(null);
export const STAFF = ['reservations', 'sales', 'gm'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading
  useEffect(() => { api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)); }, []);
  const login = useCallback(async (email, password) => { const d = await api('/auth/login', { method: 'POST', body: { email, password } }); setUser(d.user); return d.user; }, []);
  const register = useCallback(async (name, email, password) => { const d = await api('/auth/register', { method: 'POST', body: { name, email, password } }); setUser(d.user); return d.user; }, []);
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); }, []);
  const value = useMemo(() => ({ user, login, register, logout, isStaff: !!user && STAFF.includes(user.role) }), [user, login, register, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
