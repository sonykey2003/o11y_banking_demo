import React, {createContext, useCallback, useContext, useMemo, useState} from 'react';
import {BRANDS, getBrand, type Brand} from '../../brands/brands';
import {config} from '../config';
import {telemetry} from '../telemetry';

interface ThemeContextValue {
  brand: Brand;
  brands: Brand[];
  setBrandId: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const [brandId, setBrandIdState] = useState<string>(config.defaultBrandId);
  const brand = useMemo(() => getBrand(brandId), [brandId]);
  const setBrandId = useCallback((id: string) => {
    setBrandIdState(id);
    // Global RUM attribute, so DXA journeys and segments can be compared per brand.
    telemetry.setAttribute('bank.brand', id);
  }, []);
  const value = useMemo(() => ({brand, brands: BRANDS, setBrandId}), [brand, setBrandId]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
