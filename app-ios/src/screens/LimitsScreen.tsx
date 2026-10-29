import React, {useState} from 'react';
import {Alert, ScrollView, Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {useNav} from '../navigation/NavContext';
import {Card, Chip, PrimaryButton, TopBar, formatMoney} from '../components/ui';
import {telemetry} from '../telemetry';

const OPTIONS = [1000, 5000, 10000, 20000];

export function LimitsScreen() {
  const {brand} = useTheme();
  const {back} = useNav();
  const [current, setCurrent] = useState(5000);
  const [selected, setSelected] = useState(5000);

  const save = () => {
    telemetry.trackEvent('limit_update', {'bank.limit.daily': selected, 'bank.limit.previous': current});
    setCurrent(selected);
    Alert.alert('Limit updated', `Your daily transfer limit is now ${formatMoney(selected)}.`, [{text: 'OK', onPress: back}]);
  };

  return (
    <View style={{flex: 1, backgroundColor: brand.colors.background}}>
      <TopBar title="Transaction limits" onBack={back} />
      <ScrollView contentContainerStyle={{padding: 20}}>
        <Card>
          <Text style={{color: brand.colors.muted, fontSize: 13}}>Current daily transfer limit</Text>
          <Text style={{color: brand.colors.text, fontSize: 26, fontWeight: '800', marginTop: 4}}>{formatMoney(current)}</Text>
        </Card>
        <Card>
          <Text style={{color: brand.colors.text, fontWeight: '700', marginBottom: 10}}>New daily limit</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
            {OPTIONS.map((o) => (
              <Chip key={o} label={formatMoney(o).replace('.00', '')} selected={selected === o} onPress={() => setSelected(o)} />
            ))}
          </View>
          <Text style={{color: brand.colors.muted, fontSize: 12, marginTop: 4, marginBottom: 14}}>
            Increases take effect immediately in this demo.
          </Text>
          <PrimaryButton label="Save limit" onPress={save} disabled={selected === current} />
        </Card>
      </ScrollView>
    </View>
  );
}
