import React from 'react';
import {Alert, ScrollView, View} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {useNav} from '../navigation/NavContext';
import {Card, ListRow, ScreenHeader, TopBar} from '../components/ui';
import {recentMonths} from '../data/content';
import {telemetry} from '../telemetry';

export function StatementsScreen() {
  const {brand} = useTheme();
  const {back} = useNav();

  const download = (month: {id: string; label: string}) => {
    telemetry.trackEvent('statement_download', {'bank.statement.month': month.id});
    Alert.alert('Statement ready', `Your ${month.label} statement was generated (simulated).`);
  };

  return (
    <View style={{flex: 1, backgroundColor: brand.colors.background}}>
      <TopBar title="Statements" onBack={back} />
      <ScrollView contentContainerStyle={{padding: 20}}>
        <ScreenHeader title="Everyday Savings" subtitle="Monthly eStatements, last 6 months." />
        <Card>
          {recentMonths(6).map((m) => (
            <ListRow key={m.id} glyph="≡" title={m.label} subtitle="PDF · eStatement" trailing="Download" onPress={() => download(m)} />
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}
