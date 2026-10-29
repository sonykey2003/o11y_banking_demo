import React, {useState} from 'react';
import {Alert, Pressable, ScrollView, Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {useNav} from '../navigation/NavContext';
import {IconTile, PrimaryButton, ScreenHeader, TopBar} from '../components/ui';
import {PRODUCTS} from '../data/content';
import {telemetry} from '../telemetry';

export function ApplyScreen() {
  const {brand} = useTheme();
  const {params, back} = useNav();
  const [selected, setSelected] = useState<string>(String(params.product ?? PRODUCTS[0].id));
  const [submitting, setSubmitting] = useState(false);
  const entry = String(params.entry ?? 'direct');

  const submit = () => {
    setSubmitting(true);
    // Simulated underwriting delay; there is no applications backend in this demo.
    setTimeout(() => {
      setSubmitting(false);
      telemetry.trackEvent('application_submit', {'bank.product': selected, 'bank.entry': entry});
      const name = PRODUCTS.find((p) => p.id === selected)?.name ?? selected;
      Alert.alert('Application received', `We received your ${name} application (simulated).`, [{text: 'OK', onPress: back}]);
    }, 700);
  };

  return (
    <View style={{flex: 1, backgroundColor: brand.colors.background}}>
      <TopBar title="Apply" onBack={back} />
      <ScrollView contentContainerStyle={{padding: 20}}>
        <ScreenHeader title="What would you like to apply for?" />
        {PRODUCTS.map((p) => {
          const isSel = p.id === selected;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityState={{selected: isSel}}
              onPress={() => setSelected(p.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: brand.colors.surface,
                borderWidth: 2,
                borderColor: isSel ? brand.colors.primary : brand.colors.border,
                borderRadius: 12,
                padding: 14,
                marginBottom: 10,
              }}>
              <IconTile glyph={p.glyph} size={42} color={brand.colors.primaryText} background={`${brand.colors.primary}14`} />
              <View style={{flex: 1, marginLeft: 12}}>
                <Text style={{color: brand.colors.text, fontWeight: '700', fontSize: 15}}>{p.name}</Text>
                <Text style={{color: brand.colors.muted, fontSize: 13, marginTop: 2}}>{p.blurb}</Text>
              </View>
            </Pressable>
          );
        })}
        <View style={{marginTop: 8}}>
          <PrimaryButton label="Submit application" onPress={submit} loading={submitting} />
        </View>
      </ScrollView>
    </View>
  );
}
