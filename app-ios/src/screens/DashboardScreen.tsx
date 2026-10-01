import React, {useCallback, useEffect, useState} from 'react';
import {RefreshControl, ScrollView, Text, View} from 'react-native';
import {api, type Dashboard} from '../api/client';
import {useAuth} from '../state/AuthContext';
import {useTheme} from '../theme/ThemeContext';
import {useNav} from '../navigation/NavContext';
import {BrandLogo} from '../components/BrandLogo';
import {Card, LinkButton, PrimaryButton, ScreenHeader, formatMoney} from '../components/ui';

export function DashboardScreen() {
  const {brand} = useTheme();
  const {user, logout} = useAuth();
  const {navigate} = useNav();
  const [data, setData] = useState<Dashboard | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveBalance, setLiveBalance] = useState<Record<string, {money: string; at: string}>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setData(await api.dashboard());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Fetch a fresh balance via the dedicated balance-check endpoint (account-service),
  // which increments account_balance_requests_total on every tap.
  const checkBalance = useCallback(async (id: string) => {
    setCheckingId(id);
    setError(null);
    try {
      const b = await api.balance(id);
      setLiveBalance((m) => ({...m, [id]: {money: formatMoney(b.balance, b.currency), at: new Date().toLocaleTimeString()}}));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCheckingId(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      style={{backgroundColor: brand.colors.background}}
      contentContainerStyle={{padding: 20, paddingTop: 60}}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={brand.colors.primary} />}>
      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 20}}>
        <BrandLogo size={44} />
        <View style={{marginLeft: 12}}>
          <Text style={{fontSize: 13, color: brand.colors.muted}}>{brand.name}</Text>
          <Text style={{fontSize: 18, fontWeight: '800', color: brand.colors.text}}>
            Hi, {user?.name ?? data?.name ?? 'there'}
          </Text>
        </View>
      </View>

      <ScreenHeader title="Accounts" />
      {error ? <Text style={{color: '#B00020', marginBottom: 12}}>Could not load: {error}</Text> : null}
      {(data?.accounts ?? []).map((a) => (
        <Card key={a.id}>
          <Text style={{fontSize: 13, color: brand.colors.muted}}>
            {a.type} · {a.id}
          </Text>
          <Text style={{fontSize: 16, fontWeight: '600', color: brand.colors.text, marginTop: 2}}>{a.name}</Text>
          <Text style={{fontSize: 24, fontWeight: '800', color: brand.colors.primary, marginTop: 8}}>
            {liveBalance[a.id] ? liveBalance[a.id].money : `${a.currency} ••••••`}
          </Text>
          <View style={{marginTop: 10}}>
            <PrimaryButton
              label={checkingId === a.id ? 'Checking…' : liveBalance[a.id] ? 'Refresh balance' : 'Show balance'}
              onPress={() => checkBalance(a.id)}
              loading={checkingId === a.id}
            />
            {liveBalance[a.id] ? (
              <Text style={{color: brand.colors.muted, fontSize: 12, marginTop: 6}}>
                Updated {liveBalance[a.id].at}
              </Text>
            ) : null}
          </View>
        </Card>
      ))}

      <View style={{marginTop: 8, marginBottom: 8}}>
        <PrimaryButton label="Transfer money" onPress={() => navigate('transfer')} />
      </View>

      <ScreenHeader title="Recent transfers" />
      {(data?.transfers ?? []).length === 0 ? (
        <Text style={{color: brand.colors.muted, marginBottom: 12}}>No transfers yet.</Text>
      ) : (
        (data?.transfers ?? []).slice(0, 6).map((t) => (
          <Card key={t.id}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <Text style={{color: brand.colors.text}}>
                {t.fromAccountId} → {t.toAccountId}
              </Text>
              <Text style={{fontWeight: '700', color: brand.colors.text}}>{formatMoney(t.amount, t.currency)}</Text>
            </View>
            <Text style={{color: brand.colors.muted, fontSize: 12, marginTop: 4}}>{t.status}</Text>
          </Card>
        ))
      )}

      <LinkButton label="Switch bank brand" onPress={() => navigate('brands')} />
      <LinkButton label="Demo controls" onPress={() => navigate('demo')} />
      <LinkButton label="Log out" onPress={() => {
        logout();
        navigate('login');
      }} />
    </ScrollView>
  );
}
