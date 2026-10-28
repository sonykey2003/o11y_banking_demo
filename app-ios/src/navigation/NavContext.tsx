import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {telemetry} from '../telemetry';

export type Screen = 'login' | 'dashboard' | 'transfer' | 'brands' | 'demo';

// Names reported to RUM as `screen.name`. They label the screen nodes of the DXA journey
// map, so keep them human-readable and stable (renaming one splits its history in two).
const SCREEN_NAMES: Record<Screen, string> = {
  login: 'Login',
  dashboard: 'Dashboard',
  transfer: 'Transfer',
  brands: 'Brand Picker',
  demo: 'Demo Controls',
};

interface NavContextValue {
  screen: Screen;
  navigate: (s: Screen) => void;
}

const NavContext = createContext<NavContextValue | undefined>(undefined);

export function NavProvider({children}: {children: React.ReactNode}) {
  const [screen, setScreen] = useState<Screen>('login');

  // Report the first screen too, so every journey starts at a named node. telemetry
  // holds it until the SDK has finished installing.
  useEffect(() => {
    telemetry.trackScreen(SCREEN_NAMES.login);
  }, []);

  const navigate = useCallback((s: Screen) => {
    setScreen(s);
    // Feed the RUM screen/route tracker (no-op unless RUM is configured).
    telemetry.trackScreen(SCREEN_NAMES[s]);
  }, []);

  return <NavContext.Provider value={{screen, navigate}}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within NavProvider');
  return ctx;
}
