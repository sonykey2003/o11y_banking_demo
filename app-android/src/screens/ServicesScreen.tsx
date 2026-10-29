import React from 'react';
import {ScrollView, Text} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {useNav, type Screen} from '../navigation/NavContext';
import {useAuth} from '../state/AuthContext';
import {Card, LinkButton, ListRow, ScreenHeader} from '../components/ui';

const GROUPS: {title: string; rows: {glyph: string; title: string; subtitle: string; screen: Screen}[]}[] = [
  {
    title: 'Payments',
    rows: [
      {glyph: '⇄', title: 'Transfer', subtitle: 'Between your accounts', screen: 'transfer'},
      {glyph: '⌗', title: 'Scan & Pay', subtitle: 'Pay a merchant by QR code', screen: 'scan'},
      {glyph: '€', title: 'FX', subtitle: 'Exchange currencies', screen: 'fx'},
    ],
  },
  {
    title: 'Account services',
    rows: [
      {glyph: '≡', title: 'Statements', subtitle: 'Monthly eStatements', screen: 'statements'},
      {glyph: '◔', title: 'Transaction limits', subtitle: 'Daily transfer limit', screen: 'limits'},
      {glyph: '✎', title: 'Apply', subtitle: 'Cards, loans and deposits', screen: 'apply'},
      {glyph: '✉︎', title: 'Inbox', subtitle: 'Messages from the bank', screen: 'inbox'},
    ],
  },
  {
    title: 'Demo',
    rows: [
      {glyph: '◐', title: 'Switch bank brand', subtitle: 'Re-skin the app', screen: 'brands'},
      {glyph: '⚙︎', title: 'Demo controls', subtitle: 'Inject faults and RUM errors', screen: 'demo'},
    ],
  },
];

export function ServicesScreen() {
  const {brand} = useTheme();
  const {navigate, reset} = useNav();
  const {logout} = useAuth();

  return (
    <ScrollView style={{backgroundColor: brand.colors.background}} contentContainerStyle={{padding: 20}}>
      <ScreenHeader title="Services" />
      {GROUPS.map((g) => (
        <React.Fragment key={g.title}>
          <Text style={{color: brand.colors.muted, fontWeight: '700', fontSize: 12, marginBottom: 6, marginLeft: 4}}>
            {g.title.toUpperCase()}
          </Text>
          <Card>
            {g.rows.map((r) => (
              <ListRow key={r.title} glyph={r.glyph} title={r.title} subtitle={r.subtitle} onPress={() => navigate(r.screen, {entry: 'services'})} />
            ))}
          </Card>
        </React.Fragment>
      ))}
      <LinkButton
        label="Log out"
        onPress={() => {
          logout();
          reset('login');
        }}
      />
    </ScrollView>
  );
}
