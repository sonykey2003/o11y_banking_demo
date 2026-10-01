# Data & Privacy — SEA Bank Demo

This is a **synthetic demo**. It contains no real customer data and connects to no real
banking systems.

## Synthetic data only

- **Users / credentials** are hard-coded demo values (`demo/demo`, `alice/password`,
  `bob/password`). Tokens are HMAC-signed demo strings with a default demo secret — **not**
  real authentication. Do not reuse this auth pattern in production.
- **Accounts, balances, and transactions** are seeded in-memory placeholders. Nothing persists;
  restarting a pod resets the data.
- **Transfers** move fake balances between fake accounts. No payment rails are involved.

## Brands, logos & trademarks

- The 15 brands are referenced for demo realism only. The app renders a **neutral monogram**
  (initials) in an approximate palette — **not** any bank's real logo or official brand assets.
- Bank names and trademarks belong to their respective owners; their inclusion here is nominal
  and does not imply affiliation or endorsement.
- To use a real logo for a specific, authorized demo, drop the asset into `app-ios/brands/assets/`
  and render it locally. **Do not commit** third-party logo files to this repository.

## Secrets

- The repo ships **no** ingest tokens, RUM access tokens, or EUM app keys.
- When enabling RUM, keep tokens in local edits to `app-ios/src/config.ts` only — **never commit
  real tokens**. Treat `AUTH_SECRET` as a demo value; override it via env if needed.

## Telemetry

- Instrumentation is **detached**: no agent or exporter is baked into the app or images. You
  add Splunk/AppDynamics out of band. All telemetry is grouped under the environment tag
  `demoBanking-rum`.
- Do not enable capture of sensitive headers (e.g. `Authorization`, `Cookie`) in the RUM
  network-header configuration.

## Intended use

For demos, enablement, and testing of observability tooling only. Not a reference banking
implementation and not hardened for production.
