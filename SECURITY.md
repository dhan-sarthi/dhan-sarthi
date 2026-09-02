# Security

This is a prototype built for IDBI Innovate 2026. It handles no real customer data. The points
below describe how it is built and what to do if you find a problem.

## What is and is not in this repository

- **No credentials.** Provider keys and the database connection string live only in
  `apps/api/.env`, which is ignored by git. CI fails any commit that tracks an environment file or
  a credential-shaped string.
- **No customer data.** Every customer, account, transaction and balance is generated from a seed
  by `packages/fixtures`. Names, cities and merchants are illustrative.
- **No production endpoints.** The IDBI sandbox adapter is a stub until the bank issues access.

## How the code is arranged to stay safe

- **Browsers never hold a secret.** `apps/api` is the only process that talks to Runway or the
  database. The client receives a short-lived, scoped LiveKit token for a single call and nothing
  else.
- **Decisions are auditable.** Product suitability is decided by deterministic rules in
  `packages/core`, which performs no I/O. A model may phrase a verdict; it cannot produce one.
- **Dependencies are watched.** CI audits production dependencies and fails on high or critical
  advisories. Dependabot proposes weekly updates.

Not claimed: penetration testing, encryption at rest beyond what the hosting provider supplies, or
any external certification. None has been done.

## Reporting a concern

Open a private security advisory on this repository, or email the maintainers listed in
`.github/CODEOWNERS` through their GitHub profiles. We acknowledge reports within two working days
and will say what we intend to do about them.
