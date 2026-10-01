import React from 'react';
import {View, Text} from 'react-native';
import {useTheme} from '../theme/ThemeContext';

/** Neutral monogram placeholder in the brand palette (NOT the bank's real logo). */
export function BrandLogo({size = 64}: {size?: number}) {
  const {brand} = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: brand.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{color: brand.colors.onPrimary, fontWeight: '800', fontSize: size * 0.3}}>
        {brand.monogram}
      </Text>
    </View>
  );
}
