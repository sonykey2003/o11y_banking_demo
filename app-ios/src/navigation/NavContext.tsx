import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {BackHandler} from 'react-native';
import {telemetry} from '../telemetry';

export type TabScreen = 'home' | 'accounts' | 'wealth' | 'rewards' | 'services';
export type Screen =
  | 'login'
  | TabScreen
  | 'transfer'
  | 'scan'
  | 'statements'
  | 'limits'
  | 'apply'
  | 'fx'
  | 'inbox'
  | 'brands'
  | 'demo';

export const TABS: TabScreen[] = ['home', 'accounts', 'wealth', 'rewards', 'services'];

// Names reported to RUM as `screen.name`. They label the screen nodes of the DXA journey
// map, so keep them human-readable and stable (renaming one splits its history in two).
export const SCREEN_NAMES: Record<Screen, string> = {
  login: 'Login',
  home: 'Home',
  accounts: 'Accounts',
  wealth: 'Wealth',
  rewards: 'Rewards',
  services: 'Services',
  transfer: 'Transfer',
  scan: 'Scan & Pay',
  statements: 'Statements',
  limits: 'Transaction Limits',
  apply: 'Apply',
  fx: 'FX',
  inbox: 'Inbox',
  brands: 'Brand Picker',
  demo: 'Demo Controls',
};

/** Optional data for the screen being opened, e.g. a scanned amount or a chosen product. */
export type NavParams = Record<string, string | number | undefined>;

interface Entry {
  screen: Screen;
  params: NavParams;
}

interface NavContextValue {
  screen: Screen;
  params: NavParams;
  /** Open a screen on top of the current one; back() returns to it. */
  navigate: (s: Screen, params?: NavParams) => void;
  /** Replace the whole history: tab switches, after login, after logout. */
  reset: (s: Screen) => void;
  back: () => void;
}

const NavContext = createContext<NavContextValue | undefined>(undefined);

export function NavProvider({children}: {children: React.ReactNode}) {
  const [stack, setStack] = useState<Entry[]>([{screen: 'login', params: {}}]);
  const top = stack[stack.length - 1];

  // Every screen change, including the first, feeds the RUM screen tracker (no-op unless
  // RUM is configured). telemetry holds the first one until the SDK has finished installing.
  useEffect(() => {
    telemetry.trackScreen(SCREEN_NAMES[top.screen]);
  }, [top]);

  const navigate = useCallback((s: Screen, params: NavParams = {}) => {
    setStack((st) => [...st, {screen: s, params}]);
  }, []);

  const reset = useCallback((s: Screen) => {
    setStack([{screen: s, params: {}}]);
  }, []);

  const back = useCallback(() => {
    setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
  }, []);

  // Android hardware back pops the stack; on the root screen it falls through to the OS.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, back]);

  return (
    <NavContext.Provider value={{screen: top.screen, params: top.params, navigate, reset, back}}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within NavProvider');
  return ctx;
}
