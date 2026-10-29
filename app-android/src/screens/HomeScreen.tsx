import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, RefreshControl, ScrollView, Text, View} from 'react-native';
import {api, type Account} from '../api/client';
import {useAuth} from '../state/AuthContext';
import {useTheme} from '../theme/ThemeContext';
import {headerGradient, inkOn} from '../theme/color';
import {useNav, type Screen} from '../navigation/NavContext';
import {Gradient, IconTile, formatMoney} from '../components/ui';
import {PROMOS, shortDate} from '../data/content';
import {telemetry} from '../telemetry';

// Landing screen after login: balance, quick actions, shortcuts and promos over a
// gradient derived from the selected brand's primary colour.

const QUICK_ACTIONS: {label: string; glyph: string; screen: Screen; params?: Record<string, string>}[] = [
  {label: 'Quick Pay', glyph: '➚', screen: 'transfer', params: {entry: 'quick_pay'}},
  {label: 'Transfer', glyph: '⇄', screen: 'transfer', params: {entry: 'shortcut'}},
  {label: 'Scan & Pay', glyph: '⌗', screen: 'scan'},
];

const SHORTCUTS: {label: string; glyph: string; screen: Screen; badge?: string}[] = [
  {label: 'Statements', glyph: '≡', screen: 'statements'},
  {label: 'Limits', glyph: '◔', screen: 'limits'},
  {label: 'Apply', glyph: '✎', screen: 'apply'},
  {label: 'FX', glyph: '€', screen: 'fx', badge: 'No fees'},
];

// Header gradient, then a fade into the page background behind the first promo card.
const HEADER_HEIGHT = 560;
const FADE_HEIGHT = 260;

export function HomeScreen() {
  const {brand} = useTheme();
  const {user, logout} = useAuth();
  const {navigate, reset} = useNav();
  const [account, setAccount] = useState<Account | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {from, to} = headerGradient(brand.colors.primary);
  const ink = inkOn(brand.colors.primary);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const d = await api.dashboard();
      setAccount(d.accounts[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Balances stay masked until asked for. Revealing goes through the balance-check
  // endpoint (account-service), which increments account_balance_requests_total.
  const toggleBalance = async () => {
    if (!account) return;
    if (balance) {
      setBalance(null);
      return;
    }
    setRevealing(true);
    try {
      const b = await api.balance(account.id);
      setBalance(formatMoney(b.balance, b.currency).replace(`${b.currency} `, ''));
      telemetry.trackEvent('balance_check', {'bank.account.type': account.type, 'bank.entry': 'home'});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRevealing(false);
    }
  };

  const openPromo = (p: (typeof PROMOS)[number]) => {
    telemetry.trackEvent('promo_tap', {'bank.promo.id': p.id});
    navigate(p.target, p.params);
  };

  return (
    <ScrollView
      style={{backgroundColor: brand.colors.background}}
      contentContainerStyle={{paddingBottom: 24}}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={ink} />}>
      <Gradient from={from} to={to} height={HEADER_HEIGHT} />
      <Gradient from={to} to={brand.colors.background} top={HEADER_HEIGHT} height={FADE_HEIGHT} bands={32} />

      {/* Header: brand, inbox, log out */}
      <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16}}>
        <IconTile glyph={brand.monogram} size={36} fontScale={0.3} color={brand.colors.primary} background={ink} />
        <Text style={{color: ink, fontSize: 20, fontWeight: '800', marginLeft: 10}}>{brand.shortName}</Text>
        <Text style={{color: ink, fontSize: 20, fontWeight: '300', marginHorizontal: 8, opacity: 0.7}}>|</Text>
        <Text style={{color: ink, fontSize: 20, fontWeight: '700'}}>mobile</Text>
        <View style={{flex: 1}} />
        <Pressable accessibilityRole="button" onPress={() => navigate('inbox')} hitSlop={8}>
          <Text style={{color: ink, fontSize: 15, fontWeight: '600'}}>Inbox</Text>
        </Pressable>
        <Text style={{color: ink, marginHorizontal: 10, opacity: 0.6}}>|</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            logout();
            reset('login');
          }}
          hitSlop={8}>
          <Text style={{color: ink, fontSize: 15, fontWeight: '600'}}>Log out</Text>
        </Pressable>
      </View>

      {/* Primary account balance */}
      <View style={{paddingHorizontal: 20, marginTop: 28}}>
        <Text style={{color: ink, opacity: 0.85, fontSize: 14}}>Hi, {user?.name ?? 'there'}</Text>
        <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 8}}>
          <Text style={{color: ink, fontSize: 20, fontWeight: '600'}}>{account?.name ?? 'Loading account…'}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => reset('accounts')}
            style={{marginLeft: 10, borderWidth: 1.5, borderColor: ink, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2}}>
            <Text style={{color: ink, fontSize: 13, fontWeight: '600'}}>All accounts</Text>
          </Pressable>
        </View>
        <View style={{flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, minHeight: 40}}>
          {balance ? (
            <Text style={{color: ink, fontSize: 32, fontWeight: '800'}}>{balance}</Text>
          ) : (
            <View style={{width: 150, height: 4, borderRadius: 2, backgroundColor: ink, opacity: 0.45, marginBottom: 14}} />
          )}
          <Text style={{color: ink, fontSize: 28, fontWeight: '800', marginLeft: 10}}>{account?.currency ?? 'SGD'}</Text>
        </View>
        <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 6}}>
          <Text style={{color: ink, fontSize: 14, opacity: 0.9}}>Current balance</Text>
          <Pressable accessibilityRole="button" onPress={toggleBalance} disabled={!account || revealing} hitSlop={8}>
            <Text style={{color: ink, fontSize: 14, fontWeight: '700', marginLeft: 12, textDecorationLine: 'underline'}}>
              {revealing ? 'Checking…' : balance ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        </View>
        {error ? <Text style={{color: ink, marginTop: 8, fontWeight: '600'}}>Could not load: {error}</Text> : null}
      </View>

      {/* Quick actions */}
      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: 16,
          marginTop: 26,
          paddingVertical: 18,
          borderRadius: 22,
          backgroundColor: 'rgba(255,255,255,0.82)',
        }}>
        {QUICK_ACTIONS.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={() => navigate(a.screen, a.params)}
            style={({pressed}) => ({flex: 1, alignItems: 'center', opacity: pressed ? 0.6 : 1})}>
            <IconTile glyph={a.glyph} size={52} round fontScale={0.5} color={brand.colors.primaryText} background={`${brand.colors.primary}14`} />
            <Text style={{color: brand.colors.text, fontSize: 14, fontWeight: '600', marginTop: 8}}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Shortcuts */}
      <View style={{flexDirection: 'row', marginHorizontal: 8, marginTop: 26}}>
        {SHORTCUTS.map((s) => (
          <Pressable
            key={s.label}
            accessibilityRole="button"
            onPress={() => navigate(s.screen)}
            style={({pressed}) => ({flex: 1, alignItems: 'center', opacity: pressed ? 0.6 : 1})}>
            <IconTile glyph={s.glyph} size={50} color={brand.colors.primary} background={ink} />
            {s.badge ? (
              <View style={{marginTop: -10, backgroundColor: brand.colors.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1}}>
                <Text style={{color: inkOn(brand.colors.accent), fontSize: 11, fontWeight: '700'}}>{s.badge}</Text>
              </View>
            ) : null}
            <Text style={{color: ink, fontSize: 14, fontWeight: '600', marginTop: s.badge ? 4 : 8}}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Promos */}
      <View style={{paddingHorizontal: 16, marginTop: 28}}>
        {PROMOS.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            onPress={() => openPromo(p)}
            style={({pressed}) => ({
              flexDirection: 'row',
              backgroundColor: brand.colors.surface,
              borderRadius: 6,
              padding: 18,
              marginBottom: 16,
              opacity: pressed ? 0.85 : 1,
              shadowColor: '#000',
              shadowOpacity: 0.08,
              shadowRadius: 8,
              shadowOffset: {width: 0, height: 2},
              elevation: 2,
            })}>
            <View style={{flex: 1, paddingRight: 12}}>
              <Text style={{color: brand.colors.muted, fontSize: 13}}>{shortDate(p.daysAgo)}</Text>
              <View style={{width: 40, height: 3, backgroundColor: brand.colors.primary, marginTop: 6, marginBottom: 12}} />
              <Text style={{color: brand.colors.text, fontSize: 20, fontWeight: '800'}}>{p.title}</Text>
              <Text style={{color: brand.colors.muted, fontSize: 14, marginTop: 8, lineHeight: 20}}>{p.body}</Text>
            </View>
            <View style={{justifyContent: 'center'}}>
              <IconTile glyph={p.glyph} size={72} round color={brand.colors.primaryText} background={`${brand.colors.primary}18`} />
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
