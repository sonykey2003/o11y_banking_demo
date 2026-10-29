import React from 'react';
import {SafeAreaView, StatusBar, View} from 'react-native';
import {AuthProvider, useAuth} from './src/state/AuthContext';
import {ThemeProvider, useTheme} from './src/theme/ThemeContext';
import {headerGradient, inkOn} from './src/theme/color';
import {NavProvider, TABS, useNav, type Screen, type TabScreen} from './src/navigation/NavContext';
import {TabBar} from './src/components/TabBar';
import {LoginScreen} from './src/screens/LoginScreen';
import {HomeScreen} from './src/screens/HomeScreen';
import {AccountsScreen} from './src/screens/AccountsScreen';
import {WealthScreen} from './src/screens/WealthScreen';
import {RewardsScreen} from './src/screens/RewardsScreen';
import {ServicesScreen} from './src/screens/ServicesScreen';
import {TransferScreen} from './src/screens/TransferScreen';
import {ScanPayScreen} from './src/screens/ScanPayScreen';
import {StatementsScreen} from './src/screens/StatementsScreen';
import {LimitsScreen} from './src/screens/LimitsScreen';
import {ApplyScreen} from './src/screens/ApplyScreen';
import {FxScreen} from './src/screens/FxScreen';
import {InboxScreen} from './src/screens/InboxScreen';
import {BrandPickerScreen} from './src/screens/BrandPickerScreen';
import {DemoControlsScreen} from './src/screens/DemoControlsScreen';

const SCREENS: Record<Screen, React.ComponentType> = {
  login: LoginScreen,
  home: HomeScreen,
  accounts: AccountsScreen,
  wealth: WealthScreen,
  rewards: RewardsScreen,
  services: ServicesScreen,
  transfer: TransferScreen,
  scan: ScanPayScreen,
  statements: StatementsScreen,
  limits: LimitsScreen,
  apply: ApplyScreen,
  fx: FxScreen,
  inbox: InboxScreen,
  brands: BrandPickerScreen,
  demo: DemoControlsScreen,
};

// Reachable without logging in; everything else falls back to Login.
const PUBLIC: Screen[] = ['login', 'brands', 'demo'];

function Router() {
  const {screen} = useNav();
  const {user} = useAuth();
  const {brand} = useTheme();

  const current: Screen = user || PUBLIC.includes(screen) ? screen : 'login';
  const isTab = TABS.includes(current as TabScreen);
  const isHome = current === 'home';
  const Content = SCREENS[current];
  // Home draws its gradient up into the status bar area; other screens stay neutral.
  const topColor = isHome ? headerGradient(brand.colors.primary).from : brand.colors.background;

  return (
    <>
      {/* Two SafeAreaViews: the first paints only the top inset, the second the rest. */}
      <SafeAreaView style={{flex: 0, backgroundColor: topColor}} />
      <SafeAreaView style={{flex: 1, backgroundColor: isTab ? brand.colors.surface : brand.colors.background}}>
        <StatusBar
          barStyle={inkOn(isHome ? brand.colors.primary : topColor) === '#FFFFFF' ? 'light-content' : 'dark-content'}
          backgroundColor={topColor}
        />
        <View style={{flex: 1, backgroundColor: brand.colors.background}}>
          <Content />
        </View>
        {isTab ? <TabBar current={current as TabScreen} /> : null}
      </SafeAreaView>
    </>
  );
}

export default function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NavProvider>
          <Router />
        </NavProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
