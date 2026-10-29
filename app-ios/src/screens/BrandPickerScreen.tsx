import React from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {useNav} from '../navigation/NavContext';
import {LinkButton, ScreenHeader, TopBar} from '../components/ui';

export function BrandPickerScreen() {
  const {brand, brands, setBrandId} = useTheme();
  const {back} = useNav();

  return (
    <View style={{flex: 1, backgroundColor: brand.colors.background}}>
      <TopBar title="Brand" onBack={back} />
      <ScrollView contentContainerStyle={{padding: 20}}>
        <ScreenHeader title="Choose a brand" subtitle="Instantly re-skin the app for a demo." />
        {brands.map((b) => {
          const isSel = b.id === brand.id;
          return (
            <Pressable
              key={b.id}
              onPress={() => setBrandId(b.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: brand.colors.surface,
                borderWidth: 2,
                borderColor: isSel ? b.colors.primary : brand.colors.border,
                borderRadius: 12,
                padding: 12,
                marginBottom: 10,
              }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: b.colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text style={{color: b.colors.onPrimary, fontWeight: '800'}}>{b.monogram}</Text>
              </View>
              <View style={{marginLeft: 12, flex: 1}}>
                <Text style={{fontWeight: '700', color: brand.colors.text}}>{b.name}</Text>
                <Text style={{color: brand.colors.muted, fontSize: 12}}>{b.country}</Text>
              </View>
              {isSel ? <Text style={{color: b.colors.primary, fontWeight: '800'}}>✓</Text> : null}
            </Pressable>
          );
        })}
        <LinkButton label="Done" onPress={back} />
      </ScrollView>
    </View>
  );
}
