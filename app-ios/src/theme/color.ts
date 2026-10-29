// Small colour helpers so every screen derives its shades from the selected brand's
// palette instead of hardcoding one bank's look. Inputs are #RRGGBB.

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

const toHex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

/** Linear blend of two colours: t = 0 gives `a`, t = 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const ca = channels(a);
  const cb = channels(b);
  return `#${ca.map((v, i) => toHex(v + (cb[i] - v) * t)).join('')}`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable text colour on top of `bg`: near-black on light colours, white on dark ones. */
export function inkOn(bg: string): string {
  return luminance(bg) > 0.45 ? '#1A1A2E' : '#FFFFFF';
}

/** The two ends of the home-screen header gradient for a brand colour. */
export function headerGradient(primary: string): {from: string; to: string} {
  return {from: mix(primary, '#000000', 0.18), to: mix(primary, '#FFFFFF', 0.4)};
}
