import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {useNav, type TabScreen} from '../navigation/NavContext';

const ITEMS: {tab: TabScreen; label: string; glyph: string}[] = [
  {tab: 'home', label: 'Home', glyph: '⌂'},
  {tab: 'accounts', label: 'Accounts', glyph: '$'},
  {tab: 'wealth', label: 'Wealth', glyph: '↗'},
  {tab: 'rewards', label: 'Rewards', glyph: '✦'},
  {tab: 'services', label: 'Services', glyph: '⊞'},
];

/** Bottom navigation. Switching tab resets history, so back never crosses tabs. */
export function TabBar({current}: {current: TabScreen}) {
  const {brand} = useTheme();
  const {reset} = useNav();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: brand.colors.surface,
        borderTopWidth: 1,
        borderTopColor: brand.colors.border,
        paddingTop: 8,
        paddingBottom: 6,
      }}>
      {ITEMS.map((it) => {
        const active = it.tab === current;
        const color = active ? brand.colors.primaryText : brand.colors.muted;
        return (
          <Pressable
            key={it.tab}
            accessibilityRole="tab"
            accessibilityState={{selected: active}}
            accessibilityLabel={it.label}
            onPress={() => !active && reset(it.tab)}
            style={{flex: 1, alignItems: 'center'}}>
            <Text style={{color, fontSize: 24, lineHeight: 28, fontWeight: '700'}}>{it.glyph}</Text>
            <Text style={{color, fontSize: 12, fontWeight: active ? '700' : '500', marginTop: 2}}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
