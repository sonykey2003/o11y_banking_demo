// Seeded demo users. Fake credentials only — never real identities.
// The same demo users work regardless of the brand skin selected in the app.
export interface DemoUser {
  username: string;
  password: string;
  customerId: string;
  name: string;
}

export const USERS: DemoUser[] = [
  { username: 'demo', password: 'demo', customerId: 'CUST-0001', name: 'Demo User' },
  { username: 'alice', password: 'password', customerId: 'CUST-0002', name: 'Alice Tan' },
  { username: 'bob', password: 'password', customerId: 'CUST-0003', name: 'Bob Lim' },
];

export function findUser(username: string, password: string): DemoUser | undefined {
  return USERS.find((u) => u.username === username && u.password === password);
}
