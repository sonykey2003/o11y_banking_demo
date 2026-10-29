import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, ScrollView, Text, View} from 'react-native';
import {ApiError, api, type Account} from '../api/client';
import {useTheme} from '../theme/ThemeContext';
import {useNav} from '../navigation/NavContext';
import {Card, Field, LinkButton, PrimaryButton, ScreenHeader, TopBar, formatMoney} from '../components/ui';
import {telemetry} from '../telemetry';

export function TransferScreen() {
  const {brand} = useTheme();
  const {params, reset, back} = useNav();
  // Scan & Pay opens this screen with a merchant and amount; other entry points leave them unset.
  const payee = params.payee ? String(params.payee) : null;
  const entry = String(params.entry ?? 'direct');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [amount, setAmount] = useState<string>(params.amount ? String(params.amount) : '50');
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
    // Journey milestones: transfer_invalid (friction) -> transfer_submit -> transfer_complete
    // or transfer_failed. `bank.transfer.id` is the Business Journeys correlation key,
    // `bank.transfer.amount` the KPI measurement and `bank.entry` the way the user got here.
    if (!from || !to || from === to) {
      telemetry.trackEvent('transfer_invalid', {'bank.transfer.invalid_reason': 'same_account'});
      Alert.alert('Check accounts', 'Choose two different accounts.');
      return;
    }
    if (!(amt > 0)) {
      telemetry.trackEvent('transfer_invalid', {'bank.transfer.invalid_reason': 'amount'});
      Alert.alert('Check amount', 'Enter an amount greater than 0.');
      return;
    }
    setSubmitting(true);
    telemetry.trackEvent('transfer_submit', {amount: amt, 'bank.transfer.amount': amt, 'bank.entry': entry});
    try {
      const res = await api.createTransfer({fromAccountId: from, toAccountId: to, amount: amt});
      telemetry.trackEvent('transfer_complete', {
        'bank.transfer.id': res.id,
        'bank.transfer.status': res.status,
        'bank.transfer.amount': amt,
        'bank.entry': entry,
      });
      Alert.alert('Transfer submitted', `${res.id} is ${res.status}. It settles asynchronously.`);
      reset(entry === 'accounts' ? 'accounts' : 'home');
    } catch (e) {
      telemetry.trackEvent('transfer_failed', {
        'bank.transfer.amount': amt,
        'bank.http.status': e instanceof ApiError ? e.status : 0,
        'bank.entry': entry,
      });
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
            <LinkButton label="Back" onPress={back} />
          </>
        )}
      </View>
    );
  }

  return (
    <View style={{flex: 1, backgroundColor: brand.colors.background}}>
      <TopBar title={payee ? 'Scan & Pay' : 'Transfer'} onBack={back} />
      <ScrollView contentContainerStyle={{padding: 20}}>
        <ScreenHeader
          title={payee ? `Pay ${payee}` : 'Transfer money'}
          subtitle={payee ? 'Paid from your own account in this demo.' : 'All transfers are simulated.'}
        />
        <Card>
          <AccountRow label="From" selected={from} onSelect={setFrom} />
          <AccountRow label="To" selected={to} onSelect={setTo} />
          <Field label="Amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
          <PrimaryButton label="Send transfer" onPress={onSubmit} loading={submitting} />
        </Card>
      </ScrollView>
    </View>
  );
}
