// Synthetic, brand-neutral content for the screens that have no backend: promos, inbox,
// wealth, rewards, products and FX rates. Edit freely for a demo; nothing here is real.
import type {NavParams, Screen} from '../navigation/NavContext';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "29 Oct 2026" for today minus `daysAgo`. */
export function shortDate(daysAgo = 0): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** The last `n` full months, newest first, as {id: '2026-09', label: 'Sep 2026'}. */
export function recentMonths(n: number): {id: string; label: string}[] {
  const now = new Date();
  return Array.from({length: n}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
    return {id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`};
  });
}

export interface Promo {
  id: string;
  daysAgo: number;
  title: string;
  body: string;
  glyph: string;
  /** Where tapping the card goes. */
  target: Screen;
  params?: NavParams;
}

export const PROMOS: Promo[] = [
  {
    id: 'card-cashback',
    daysAgo: 0,
    title: "Don't miss out on cashback!",
    body: 'Earn up to 8% cashback on daily essentials with the Everyday Card.',
    glyph: '%',
    target: 'apply',
    params: {product: 'credit_card', entry: 'promo'},
  },
  {
    id: 'fx-no-fees',
    daysAgo: 1,
    title: 'Travel with zero FX fees',
    body: 'Hold and exchange 10 currencies in the app, any time.',
    glyph: '€',
    target: 'fx',
  },
  {
    id: 'fd-rate',
    daysAgo: 3,
    title: 'Lock in 3.1% p.a.',
    body: 'A 12-month fixed deposit, opened in under two minutes.',
    glyph: '◷',
    target: 'apply',
    params: {product: 'fixed_deposit', entry: 'promo'},
  },
];

export const INBOX = [
  {id: 'msg-statement', daysAgo: 0, title: 'Your statement is ready', body: 'Your Everyday Savings statement for last month is now available under Statements.'},
  {id: 'msg-login', daysAgo: 1, title: 'New sign-in detected', body: 'You signed in on a new device. If this was not you, lock your account from Services.'},
  {id: 'msg-limit', daysAgo: 4, title: 'Transfer limit updated', body: 'Your daily transfer limit change is now in effect.'},
];

export const PRODUCTS = [
  {id: 'credit_card', name: 'Everyday Card', blurb: 'Up to 8% cashback, no annual fee for the first year.', glyph: '▭'},
  {id: 'personal_loan', name: 'Personal Loan', blurb: 'Borrow up to 6x your monthly income, from 3.5% p.a.', glyph: '◎'},
  {id: 'fixed_deposit', name: 'Fixed Deposit', blurb: '12 months at 3.1% p.a., from SGD 1,000.', glyph: '◷'},
  {id: 'multi_currency', name: 'Multi-Currency Account', blurb: 'Hold 10 currencies with no FX fees.', glyph: '€'},
];

export const HOLDINGS = [
  {id: 'unit_trusts', name: 'Unit trusts', value: 21450.4, change: 1.8},
  {id: 'equities', name: 'Equities', value: 15980.0, change: 3.6},
  {id: 'bonds', name: 'Bonds', value: 7300.75, change: 0.4},
  {id: 'gold', name: 'Gold savings', value: 3500.0, change: -0.7},
];

export const REWARDS = [
  {id: 'coffee-voucher', name: 'Coffee voucher', points: 1200, glyph: '☕︎'},
  {id: 'grocery-10', name: 'SGD 10 grocery credit', points: 3000, glyph: '▤'},
  {id: 'airmiles-1000', name: '1,000 air miles', points: 5000, glyph: '✈︎'},
  {id: 'cashback-25', name: 'SGD 25 cashback', points: 7500, glyph: '$'},
];

/** SGD to each currency. Static demo rates. */
export const FX_RATES: Record<string, number> = {
  USD: 0.74,
  MYR: 3.47,
  IDR: 11780,
  THB: 26.9,
  PHP: 42.6,
  VND: 18750,
};

/** Synthetic merchant returned by a simulated QR scan. */
export const SCAN_MERCHANT = {name: 'Kopi Corner', amount: 6.8};
