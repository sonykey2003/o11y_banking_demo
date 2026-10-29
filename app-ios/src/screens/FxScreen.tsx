import React, {useState} from 'react';
import {Alert, ScrollView, Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {useNav} from '../navigation/NavContext';
import {Card, Chip, Field, PrimaryButton, TopBar, formatMoney} from '../components/ui';
import {FX_RATES} from '../data/content';
import {telemetry} from '../telemetry';

export function FxScreen() {
  const {brand} = useTheme();
  const {back} = useNav();
  const [currency, setCurrency] = useState('USD');
  const [amount, setAmount] = useState('500');
  const amt = Number(amount);
  const rate = FX_RATES[currency];
  const converted = amt > 0 ? amt * rate : 0;

  const exchange = () => {
    if (!(amt > 0)) {
      Alert.alert('Check amount', 'Enter an amount greater than 0.');
      return;
    }
    telemetry.trackEvent('fx_exchange', {'bank.fx.pair': `SGD/${currency}`, 'bank.fx.amount': amt});
    Alert.alert('Exchanged', `${formatMoney(amt)} → ${formatMoney(converted, currency)} (simulated).`, [{text: 'OK', onPress: back}]);
  };

  return (
    <View style={{flex: 1, backgroundColor: brand.colors.background}}>
      <TopBar title="FX" onBack={back} />
      <ScrollView contentContainerStyle={{padding: 20}}>
        <Card>
          <Text style={{color: brand.colors.text, fontWeight: '700', marginBottom: 10}}>Exchange SGD to</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
            {Object.keys(FX_RATES).map((c) => (
              <Chip key={c} label={c} selected={c === currency} onPress={() => setCurrency(c)} />
            ))}
          </View>
          <Field label="Amount (SGD)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
          <Text style={{color: brand.colors.muted, fontSize: 13}}>
            1 SGD = {rate.toLocaleString()} {currency} · no fees
          </Text>
          <Text style={{color: brand.colors.text, fontSize: 26, fontWeight: '800', marginTop: 6, marginBottom: 14}}>
            {formatMoney(converted, currency)}
          </Text>
          <PrimaryButton label="Exchange" onPress={exchange} />
        </Card>
      </ScrollView>
    </View>
  );
}
