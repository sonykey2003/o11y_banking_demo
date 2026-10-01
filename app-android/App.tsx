import React from 'react';
import {SafeAreaView, StatusBar} from 'react-native';
import {AuthProvider, useAuth} from './src/state/AuthContext';
import {ThemeProvider, useTheme} from './src/theme/ThemeContext';
import {NavProvider, useNav} from './src/navigation/NavContext';
import {LoginScreen} from './src/screens/LoginScreen';
import {DashboardScreen} from './src/screens/DashboardScreen';
import {TransferScreen} from './src/screens/TransferScreen';
import {BrandPickerScreen} from './src/screens/BrandPickerScreen';
import {DemoControlsScreen} from './src/screens/DemoControlsScreen';

function Router() {
  const {screen} = useNav();
  const {user} = useAuth();
  const {brand} = useTheme();

  let content: React.ReactNode;
  if (screen === 'brands') content = <BrandPickerScreen />;
  else if (screen === 'demo') content = <DemoControlsScreen />;
  else if (!user) content = <LoginScreen />;
  else if (screen === 'transfer') content = <TransferScreen />;
  else content = <DashboardScreen />;

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: brand.colors.background}}>
      <StatusBar barStyle="dark-content" />
      {content}
    </SafeAreaView>
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
