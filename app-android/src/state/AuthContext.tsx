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

// Customer who logged in last in this app run. Anyone else gets a fresh anonymous RUM
// user, so each persona counts as its own user in DXA. (The first login after a launch
// also rotates: the stored ID may belong to whoever used the app before the restart.)
let lastCustomerId: string | null = null;

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await api.login(username, password);
      setToken(res.token);
      if (res.customerId !== lastCustomerId) await telemetry.newAnonymousUser();
      lastCustomerId = res.customerId;
      // Synthetic customer ID and profile, so DXA user segments can split by persona.
      telemetry.setAttribute('bank.customer.id', res.customerId);
      telemetry.setAttribute('bank.customer.segment', res.segment ?? null);
      telemetry.trackEvent('login_submit', {result: 'success'});
      setUser({customerId: res.customerId, name: res.name});
    } catch (e) {
      telemetry.trackEvent('login_submit', {result: 'failure'});
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    telemetry.trackEvent('logout');
    telemetry.setAttribute('bank.customer.id', null);
    telemetry.setAttribute('bank.customer.segment', null);
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
