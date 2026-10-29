// Seeded demo users. Fake credentials only — never real identities.
// The same demo users work regardless of the brand skin selected in the app.
export interface DemoUser {
  username: string;
  /** null = passwordless persona: any password (even an empty one) is accepted. */
  password: string | null;
  customerId: string;
  name: string;
  /** Customer profile, sent to RUM as `bank.customer.segment` for DXA user segments. */
  segment: string;
}

export const USERS: DemoUser[] = [
  { username: 'demo', password: 'demo', customerId: 'CUST-0001', name: 'Demo User', segment: 'mass' },
  { username: 'alice', password: 'password', customerId: 'CUST-0002', name: 'Alice Tan', segment: 'mass' },
  { username: 'bob', password: 'password', customerId: 'CUST-0003', name: 'Bob Lim', segment: 'mass' },
  // Journey-map personas: log in with any password. Each has two accounts (see the MySQL
  // seed) so every persona can make a transfer.
  { username: 'sarah', password: null, customerId: 'CUST-0004', name: 'Sarah Wong', segment: 'student' },
  { username: 'raj', password: null, customerId: 'CUST-0005', name: 'Raj Kumar', segment: 'young_professional' },
  { username: 'mei', password: null, customerId: 'CUST-0006', name: 'Mei Ling Chen', segment: 'family' },
  { username: 'ken', password: null, customerId: 'CUST-0007', name: 'Ken Nakamura', segment: 'affluent' },
  { username: 'nur', password: null, customerId: 'CUST-0008', name: 'Nur Aisyah', segment: 'sme_owner' },
];

export function findUser(username: string, password: string): DemoUser | undefined {
  // Case-insensitive usernames: phone keyboards like to capitalise the first letter.
  const u = USERS.find((x) => x.username === username.trim().toLowerCase());
  if (!u) return undefined;
  return u.password === null || u.password === password ? u : undefined;
}
