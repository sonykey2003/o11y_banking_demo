import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, ScrollView, Text, View} from 'react-native';
import {api, type Account} from '../api/client';
import {useTheme} from '../theme/ThemeContext';
import {useNav} from '../navigation/NavContext';
import {Card, Field, LinkButton, PrimaryButton, ScreenHeader, formatMoney} from '../components/ui';
import {telemetry} from '../telemetry';

export function TransferScreen() {
  const {brand} = useTheme();
  const {navigate} = useNav();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [amount, setAmount] = useState<string>('50');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const d = await api.dashboard();
      setAccounts(d.accounts);
      setFrom(d.accounts[0]?.id ?? '');
      setTo(d.accounts[1]?.id ?? d.accounts[0]?.id ?? '');
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const onSubmit = async () => {
    const amt = Number(amount);
    if (!from || !to || from === to) {
      Alert.alert('Check accounts', 'Choose two different accounts.');
      return;
    }
    if (!(amt > 0)) {
      Alert.alert('Check amount', 'Enter an amount greater than 0.');
      return;
    }
    setSubmitting(true);
    telemetry.trackEvent('transfer_submit', {amount: amt});
    try {
      const res = await api.createTransfer({fromAccountId: from, toAccountId: to, amount: amt});
      Alert.alert('Transfer submitted', `${res.id} is ${res.status}. It settles asynchronously.`);
      navigate('dashboard');
    } catch (e) {
      telemetry.reportError(e);
      Alert.alert('Transfer failed', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const AccountRow = ({label, selected, onSelect}: {label: string; selected: string; onSelect: (id: string) => void}) => (
    <View style={{marginBottom: 14}}>
      <Text style={{color: brand.colors.muted, marginBottom: 6, fontSize: 13, fontWeight: '600'}}>{label}</Text>
      {accounts.map((a) => {
        const isSel = a.id === selected;
        return (
          <Pressable
            key={a.id}
            onPress={() => onSelect(a.id)}
            style={{
              borderWidth: 1,
              borderColor: isSel ? brand.colors.primary : brand.colors.border,
              backgroundColor: isSel ? `${brand.colors.primary}12` : brand.colors.surface,
              borderRadius: 10,
              padding: 12,
              marginBottom: 8,
            }}>
            <Text style={{color: brand.colors.text, fontWeight: '600'}}>
              {a.name} · {a.id}
            </Text>
            <Text style={{color: brand.colors.muted, fontSize: 12}}>{formatMoney(a.balance, a.currency)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (accounts.length === 0) {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.colors.background, padding: 24}}>
        {loading ? (
          <ActivityIndicator color={brand.colors.primary} />
        ) : (
          <>
            <Text style={{color: '#B00020', textAlign: 'center', marginBottom: 16}}>
              Could not load accounts{loadError ? `: ${loadError}` : ''}
            </Text>
            <PrimaryButton label="Retry" onPress={loadAccounts} />
            <LinkButton label="Back" onPress={() => navigate('dashboard')} />
          </>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={{backgroundColor: brand.colors.background}} contentContainerStyle={{padding: 20, paddingTop: 60}}>
      <ScreenHeader title="Transfer money" subtitle="All transfers are simulated." />
      <Card>
        <AccountRow label="From" selected={from} onSelect={setFrom} />
        <AccountRow label="To" selected={to} onSelect={setTo} />
        <Field label="Amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <PrimaryButton label="Send transfer" onPress={onSubmit} loading={submitting} />
      </Card>
      <LinkButton label="Back" onPress={() => navigate('dashboard')} />
    </ScrollView>
  );
}
