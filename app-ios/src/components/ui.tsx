import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import {useTheme} from '../theme/ThemeContext';

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const {brand} = useTheme();
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={{
        backgroundColor: brand.colors.primary,
        opacity: isDisabled ? 0.6 : 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
      }}>
      {loading ? (
        <ActivityIndicator color={brand.colors.onPrimary} />
      ) : (
        <Text style={{color: brand.colors.onPrimary, fontWeight: '700', fontSize: 16}}>{label}</Text>
      )}
    </Pressable>
  );
}

export function LinkButton({label, onPress}: {label: string; onPress: () => void}) {
  const {brand} = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{paddingVertical: 10, alignItems: 'center'}}>
      <Text style={{color: brand.colors.primary, fontWeight: '600', fontSize: 15}}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & {label: string}) {
  const {brand} = useTheme();
  const {label, ...rest} = props;
  return (
    <View style={{marginBottom: 14}}>
      <Text style={{color: brand.colors.muted, marginBottom: 6, fontSize: 13, fontWeight: '600'}}>{label}</Text>
      <TextInput
        placeholderTextColor={brand.colors.muted}
        style={{
          borderWidth: 1,
          borderColor: brand.colors.border,
          backgroundColor: brand.colors.surface,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 16,
          color: brand.colors.text,
        }}
        {...rest}
      />
    </View>
  );
}

export function Card({children}: {children: React.ReactNode}) {
  const {brand} = useTheme();
  return (
    <View
      style={{
        backgroundColor: brand.colors.surface,
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: brand.colors.border,
      }}>
      {children}
    </View>
  );
}

export function ScreenHeader({title, subtitle}: {title: string; subtitle?: string}) {
  const {brand} = useTheme();
  return (
    <View style={{marginBottom: 16}}>
      <Text style={{fontSize: 24, fontWeight: '800', color: brand.colors.text}}>{title}</Text>
      {subtitle ? <Text style={{fontSize: 14, color: brand.colors.muted, marginTop: 4}}>{subtitle}</Text> : null}
    </View>
  );
}

export function formatMoney(amount: number, currency = 'SGD'): string {
  return `${currency} ${amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}
