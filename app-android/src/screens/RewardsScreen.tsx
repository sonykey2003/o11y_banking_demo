import React, {useState} from 'react';
import {Alert, ScrollView, Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {headerGradient, inkOn} from '../theme/color';
import {Card, Gradient, ListRow, ScreenHeader} from '../components/ui';
import {REWARDS} from '../data/content';
import {telemetry} from '../telemetry';

export function RewardsScreen() {
  const {brand} = useTheme();
  // Points live only in this screen's state; the demo resets them on every launch.
  const [points, setPoints] = useState(12480);
  const {from, to} = headerGradient(brand.colors.primary);
  const ink = inkOn(brand.colors.primary);

  const redeem = (r: (typeof REWARDS)[number]) => {
    if (points < r.points) {
      telemetry.trackEvent('reward_redeem_blocked', {'bank.reward.id': r.id, 'bank.reward.points': r.points});
      Alert.alert('Not enough points', `You need ${(r.points - points).toLocaleString()} more points.`);
      return;
    }
    Alert.alert('Redeem reward', `Redeem ${r.name} for ${r.points.toLocaleString()} points?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Redeem',
        onPress: () => {
          setPoints((p) => p - r.points);
          telemetry.trackEvent('reward_redeem', {'bank.reward.id': r.id, 'bank.reward.points': r.points});
        },
      },
    ]);
  };

  return (
    <ScrollView style={{backgroundColor: brand.colors.background}} contentContainerStyle={{padding: 20}}>
      <ScreenHeader title="Rewards" />
      <View style={{borderRadius: 16, overflow: 'hidden', padding: 20, marginBottom: 12}}>
        <Gradient from={from} to={to} height={140} bands={24} />
        <Text style={{color: ink, opacity: 0.85}}>Available points</Text>
        <Text style={{color: ink, fontSize: 36, fontWeight: '800', marginTop: 4}}>{points.toLocaleString()}</Text>
        <Text style={{color: ink, opacity: 0.85, marginTop: 4}}>Earn 1 point for every SGD 1 spent</Text>
      </View>
      <Card>
        {REWARDS.map((r) => (
          <ListRow
            key={r.id}
            glyph={r.glyph}
            title={r.name}
            subtitle={`${r.points.toLocaleString()} points`}
            trailing={points >= r.points ? 'Redeem' : 'Locked'}
            onPress={() => redeem(r)}
          />
        ))}
      </Card>
    </ScrollView>
  );
}
