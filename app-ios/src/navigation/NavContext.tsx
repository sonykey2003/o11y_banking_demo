import React, {createContext, useCallback, useContext, useState} from 'react';
import {telemetry} from '../telemetry';

export type Screen = 'login' | 'dashboard' | 'transfer' | 'brands' | 'demo';

interface NavContextValue {
  screen: Screen;
  navigate: (s: Screen) => void;
}

const NavContext = createContext<NavContextValue | undefined>(undefined);

export function NavProvider({children}: {children: React.ReactNode}) {
  const [screen, setScreen] = useState<Screen>('login');

  const navigate = useCallback((s: Screen) => {
    setScreen(s);
    // Feed the RUM screen/route tracker (no-op unless RUM is configured).
    telemetry.trackScreen(s);
  }, []);

  return <NavContext.Provider value={{screen, navigate}}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within NavProvider');
  return ctx;
}
