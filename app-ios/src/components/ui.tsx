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
import {mix} from '../theme/color';

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
      <Text style={{color: brand.colors.primaryText, fontWeight: '600', fontSize: 15}}>{label}</Text>
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

/**
 * Vertical gradient drawn as thin colour bands, so it needs no native gradient library.
 * Positioned absolutely at the top of its parent; put content after it.
 */
export function Gradient({
  from,
  to,
  height,
  top = 0,
  bands = 48,
}: {
  from: string;
  to: string;
  height: number;
  top?: number;
  bands?: number;
}) {
  return (
    <View pointerEvents="none" style={{position: 'absolute', top, left: 0, right: 0, height, overflow: 'hidden'}}>
      {/* Each band is placed exactly and overlaps the next by 1px: flex-sized bands get
          rounded to whole pixels on Android, which leaves hairline gaps between them. */}
      {Array.from({length: bands}, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: (i * height) / bands,
            height: height / bands + 1,
            backgroundColor: mix(from, to, i / (bands - 1)),
          }}
        />
      ))}
    </View>
  );
}

/** A text glyph on a rounded tile: the app's icon style (no icon font dependency). */
export function IconTile({
  glyph,
  color,
  background,
  size = 44,
  round,
  fontScale = 0.48,
}: {
  glyph: string;
  color: string;
  background: string;
  size?: number;
  round?: boolean;
  fontScale?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: round ? size / 2 : size / 3.2,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{color, fontSize: size * fontScale, fontWeight: '700'}}>{glyph}</Text>
    </View>
  );
}

/** Title bar for screens opened on top of a tab, with a back button. */
export function TopBar({title, onBack}: {title: string; onBack: () => void}) {
  const {brand} = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 52,
        paddingHorizontal: 8,
        backgroundColor: brand.colors.background,
        borderBottomWidth: 1,
        borderBottomColor: brand.colors.border,
      }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12} style={{padding: 8}}>
        <Text style={{fontSize: 28, lineHeight: 30, color: brand.colors.primaryText, fontWeight: '600'}}>‹</Text>
      </Pressable>
      <Text style={{fontSize: 17, fontWeight: '700', color: brand.colors.text, marginLeft: 4}}>{title}</Text>
    </View>
  );
}

/** Tappable row with an icon, a title, an optional subtitle and a trailing value or chevron. */
export function ListRow({
  glyph,
  title,
  subtitle,
  trailing,
  onPress,
}: {
  glyph?: string;
  title: string;
  subtitle?: string;
  trailing?: string;
  onPress?: () => void;
}) {
  const {brand} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        opacity: pressed ? 0.6 : 1,
      })}>
      {glyph ? <IconTile glyph={glyph} size={38} color={brand.colors.primaryText} background={`${brand.colors.primary}14`} /> : null}
      <View style={{flex: 1, marginLeft: glyph ? 12 : 0}}>
        <Text style={{fontSize: 15, fontWeight: '600', color: brand.colors.text}}>{title}</Text>
        {subtitle ? <Text style={{fontSize: 12, color: brand.colors.muted, marginTop: 2}}>{subtitle}</Text> : null}
      </View>
      <Text style={{color: trailing ? brand.colors.text : brand.colors.muted, fontWeight: trailing ? '700' : '400', fontSize: trailing ? 14 : 20}}>
        {trailing ?? '›'}
      </Text>
    </Pressable>
  );
}

/** Selectable pill, used for single-choice pickers (limits, currencies, products). */
export function Chip({label, selected, onPress}: {label: string; selected: boolean; onPress: () => void}) {
  const {brand} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{selected}}
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? brand.colors.primary : brand.colors.border,
        backgroundColor: selected ? `${brand.colors.primary}14` : brand.colors.surface,
        marginRight: 8,
        marginBottom: 8,
      }}>
      <Text style={{color: selected ? brand.colors.primaryText : brand.colors.text, fontWeight: '600'}}>{label}</Text>
    </Pressable>
  );
}

export function formatMoney(amount: number, currency = 'SGD'): string {
  return `${currency} ${amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}
