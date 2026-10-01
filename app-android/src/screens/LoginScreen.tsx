import React, {useState} from 'react';
import {Alert, ScrollView, Text, View} from 'react-native';
import {useAuth} from '../state/AuthContext';
import {useTheme} from '../theme/ThemeContext';
import {useNav} from '../navigation/NavContext';
import {BrandLogo} from '../components/BrandLogo';
import {Field, LinkButton, PrimaryButton} from '../components/ui';
import {ApiError} from '../api/client';

export function LoginScreen() {
  const {brand} = useTheme();
  const {login} = useAuth();
  const {navigate} = useNav();
  const [username, setUsername] = useState('demo');
  const [password, setPassword] = useState('demo');
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate('dashboard');
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 401 ? 'Invalid credentials' : (e as Error).message;
      Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{flexGrow: 1, justifyContent: 'center', padding: 24}}
      style={{backgroundColor: brand.colors.background}}>
      <View style={{alignItems: 'center', marginBottom: 28}}>
        <BrandLogo size={84} />
        <Text style={{marginTop: 16, fontSize: 22, fontWeight: '800', color: brand.colors.text}}>{brand.name}</Text>
        <Text style={{marginTop: 4, fontSize: 13, color: brand.colors.muted}}>{brand.country} · demo</Text>
      </View>

      <Field label="Username" autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} />
      <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} />

      <PrimaryButton label="Log in" onPress={onLogin} loading={loading} />

      <View style={{marginTop: 8}}>
        <LinkButton label="Switch bank brand" onPress={() => navigate('brands')} />
        <LinkButton label="Demo controls" onPress={() => navigate('demo')} />
      </View>

      <Text style={{textAlign: 'center', color: brand.colors.muted, fontSize: 12, marginTop: 16}}>
        Demo users: demo/demo · alice/password · bob/password
      </Text>
    </ScrollView>
  );
}
