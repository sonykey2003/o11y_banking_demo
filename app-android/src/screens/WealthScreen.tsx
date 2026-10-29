import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {mix} from '../theme/color';
import {useNav} from '../navigation/NavContext';
import {Card, ListRow, PrimaryButton, ScreenHeader, formatMoney} from '../components/ui';
import {HOLDINGS} from '../data/content';
import {telemetry} from '../telemetry';

export function WealthScreen() {
  const {brand} = useTheme();
  const {navigate} = useNav();
  const total = HOLDINGS.reduce((sum, h) => sum + h.value, 0);
  // Allocation bar shades step from the brand colour towards white.
  const shade = (i: number) => mix(brand.colors.primary, '#FFFFFF', i / (HOLDINGS.length + 1));

  return (
    <ScrollView style={{backgroundColor: brand.colors.background}} contentContainerStyle={{padding: 20}}>
      <ScreenHeader title="Wealth" subtitle="Simulated portfolio, for the demo only." />
      <Card>
        <Text style={{color: brand.colors.muted, fontSize: 13}}>Total portfolio value</Text>
        <Text style={{color: brand.colors.text, fontSize: 28, fontWeight: '800', marginTop: 4}}>{formatMoney(total)}</Text>
        <Text style={{color: '#15803D', fontWeight: '700', marginTop: 2}}>▲ 2.1% this month</Text>
        <View style={{flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 16}}>
          {HOLDINGS.map((h, i) => (
            <View key={h.id} style={{flex: h.value, backgroundColor: shade(i)}} />
          ))}
        </View>
      </Card>

      <Card>
        {HOLDINGS.map((h, i) => (
          <View key={h.id} style={{flexDirection: 'row', alignItems: 'center'}}>
            <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: shade(i), marginRight: 10}} />
            <View style={{flex: 1}}>
              <ListRow
                title={h.name}
                subtitle={`${((h.value / total) * 100).toFixed(1)}% · ${h.change >= 0 ? '▲' : '▼'} ${Math.abs(h.change)}%`}
                trailing={formatMoney(h.value)}
                onPress={() => telemetry.trackEvent('holding_view', {'bank.holding.id': h.id})}
              />
            </View>
          </View>
        ))}
      </Card>

      <PrimaryButton label="Open a fixed deposit" onPress={() => navigate('apply', {product: 'fixed_deposit', entry: 'wealth'})} />
    </ScrollView>
  );
}
