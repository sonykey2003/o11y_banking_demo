// Small env helpers.
export function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

export function port(fallback: number): number {
  const v = process.env.PORT;
  return v ? Number(v) : fallback;
}
