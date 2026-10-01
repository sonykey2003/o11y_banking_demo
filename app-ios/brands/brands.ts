// Brand catalog for the logo/theme switcher — the top-15 SEA consumer banks.
//
// LOGOS & TRADEMARKS: these are demo *placeholders* only. We render a neutral
// monogram (initials) in the brand's approximate palette — NOT the bank's real
// logo — to avoid using third-party trademarks. To use a real logo for a specific
// demo, drop an asset into brands/assets/ and render it locally (do not commit it).
// Colors are close-enough demo approximations, not official brand specifications.

export interface BrandColors {
  primary: string;
  onPrimary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
}

export interface Brand {
  id: string;
  name: string;
  shortName: string;
  monogram: string;
  country: string;
  colors: BrandColors;
}

function palette(primary: string, onPrimary: string, accent: string): BrandColors {
  return {
    primary,
    onPrimary,
    accent,
    background: '#F4F5F7',
    surface: '#FFFFFF',
    text: '#1A1A2E',
    muted: '#6B7280',
    border: '#E5E7EB',
  };
}

export const BRANDS: Brand[] = [
  { id: 'dbs', name: 'DBS Bank', shortName: 'DBS', monogram: 'DBS', country: 'Singapore', colors: palette('#E4002B', '#FFFFFF', '#B00020') },
  { id: 'ocbc', name: 'OCBC Bank', shortName: 'OCBC', monogram: 'OC', country: 'Singapore', colors: palette('#E60012', '#FFFFFF', '#A5000D') },
  { id: 'uob', name: 'United Overseas Bank', shortName: 'UOB', monogram: 'UOB', country: 'Singapore', colors: palette('#005EB8', '#FFFFFF', '#003F7D') },
  { id: 'maybank', name: 'Maybank', shortName: 'Maybank', monogram: 'MB', country: 'Malaysia', colors: palette('#FFC500', '#1A1A2E', '#E0A800') },
  { id: 'cimb', name: 'CIMB Bank', shortName: 'CIMB', monogram: 'CI', country: 'Malaysia', colors: palette('#EC1C24', '#FFFFFF', '#B3151B') },
  { id: 'publicbank', name: 'Public Bank', shortName: 'Public', monogram: 'PB', country: 'Malaysia', colors: palette('#C8102E', '#FFFFFF', '#8E0B20') },
  { id: 'bangkokbank', name: 'Bangkok Bank', shortName: 'BBL', monogram: 'BBL', country: 'Thailand', colors: palette('#1E4598', '#FFFFFF', '#14306B') },
  { id: 'kbank', name: 'Kasikornbank', shortName: 'KBank', monogram: 'KB', country: 'Thailand', colors: palette('#138F2D', '#FFFFFF', '#0C6420') },
  { id: 'scb', name: 'Siam Commercial Bank', shortName: 'SCB', monogram: 'SCB', country: 'Thailand', colors: palette('#4E2A84', '#FFFFFF', '#361D5C') },
  { id: 'bca', name: 'Bank Central Asia', shortName: 'BCA', monogram: 'BCA', country: 'Indonesia', colors: palette('#0060AF', '#FFFFFF', '#00447C') },
  { id: 'mandiri', name: 'Bank Mandiri', shortName: 'Mandiri', monogram: 'BM', country: 'Indonesia', colors: palette('#003D79', '#FFC72C', '#002A54') },
  { id: 'bri', name: 'Bank Rakyat Indonesia', shortName: 'BRI', monogram: 'BRI', country: 'Indonesia', colors: palette('#00529C', '#F5A800', '#003A6E') },
  { id: 'bdo', name: 'BDO Unibank', shortName: 'BDO', monogram: 'BDO', country: 'Philippines', colors: palette('#00205B', '#0093D0', '#00163F') },
  { id: 'bpi', name: 'Bank of the Philippine Islands', shortName: 'BPI', monogram: 'BPI', country: 'Philippines', colors: palette('#A6192E', '#FFFFFF', '#7A1222') },
  { id: 'vietcombank', name: 'Vietcombank', shortName: 'VCB', monogram: 'VCB', country: 'Vietnam', colors: palette('#007A33', '#FFFFFF', '#005423') },
];

export function getBrand(id: string): Brand {
  return BRANDS.find((b) => b.id === id) ?? BRANDS[0];
}
