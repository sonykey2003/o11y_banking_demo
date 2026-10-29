import React, {useState} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {useNav} from '../navigation/NavContext';
import {Card, TopBar} from '../components/ui';
import {INBOX, shortDate} from '../data/content';
import {telemetry} from '../telemetry';

export function InboxScreen() {
  const {brand} = useTheme();
  const {back} = useNav();
  const [open, setOpen] = useState<string | null>(null);

  const toggle = (id: string) => {
    if (open !== id) telemetry.trackEvent('inbox_open', {'bank.message.id': id});
    setOpen(open === id ? null : id);
  };

  return (
    <View style={{flex: 1, backgroundColor: brand.colors.background}}>
      <TopBar title="Inbox" onBack={back} />
      <ScrollView contentContainerStyle={{padding: 20}}>
        {INBOX.map((m) => (
          <Pressable key={m.id} accessibilityRole="button" onPress={() => toggle(m.id)}>
            <Card>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                <Text style={{color: brand.colors.text, fontWeight: '700', flex: 1}}>{m.title}</Text>
                <Text style={{color: brand.colors.muted, fontSize: 12, marginLeft: 8}}>{shortDate(m.daysAgo)}</Text>
              </View>
              <Text style={{color: brand.colors.muted, marginTop: 6, lineHeight: 20}} numberOfLines={open === m.id ? undefined : 1}>
                {m.body}
              </Text>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
