import React, {createContext, useContext, useMemo, useState} from 'react';
import {BRANDS, getBrand, type Brand} from '../../brands/brands';
import {config} from '../config';

interface ThemeContextValue {
  brand: Brand;
  brands: Brand[];
  setBrandId: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const [brandId, setBrandId] = useState<string>(config.defaultBrandId);
  const brand = useMemo(() => getBrand(brandId), [brandId]);
  const value = useMemo(() => ({brand, brands: BRANDS, setBrandId}), [brand]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
