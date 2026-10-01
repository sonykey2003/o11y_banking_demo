import React, {createContext, useCallback, useContext, useState} from 'react';
import {api, setToken} from '../api/client';
import {telemetry} from '../telemetry';

interface AuthUser {
  customerId: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await api.login(username, password);
      setToken(res.token);
      setUser({customerId: res.customerId, name: res.name});
      telemetry.trackEvent('login_submit', {result: 'success'});
    } catch (e) {
      telemetry.trackEvent('login_submit', {result: 'failure'});
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{user, login, logout}}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
