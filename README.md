# FreelanceIT

A ledger with a client door, for freelancers.

Track time and expenses, turn them into invoices, collect payments, and give each client a private link where they can see their invoices, download the PDF, and pay. Every number on screen is derived from one money trail; totals are never typed by hand.

> **Status:** pre-build. Requirements, UI sketch, and roadmap are done. See [`todo.md`](./todo.md).

## Why it exists

1. A real tool for running freelance books correctly.
2. A deliberately large Angular learning project: signals, typed forms, guards, resolvers, interceptors, lazy loading, SSR, and CDK, all with a natural home.

## Core ideas

- **One money trail.** Time and expenses → invoice lines → payments and credit notes. The dashboard is queries over that trail, never a second source of truth.
- **Sent means immutable.** Mistakes become credit notes or void-and-reissue. This keeps the ledger auditable.
- **Integer money.** Minor units plus an ISO currency. No floats anywhere.
- **Snapshots.** Tax rate, label, and inclusive/exclusive are copied onto each line at issue time; client and seller details are copied onto the invoice.
- **Multiple tax rates per invoice**, computed per rate group, one tax mode (inclusive or exclusive) per invoice.
- **Tokenized client portal.** No client accounts; the token scopes every query to one client and can be rotated.

## Features (v1)

- Clients, projects, rate cards
- Timer and manual time entries, expenses with receipts, unbilled queue
- Invoice builder with live totals, autosave, and conflict detection
- Gapless numbering at send, server-generated PDF from the frozen snapshot
- Manual payments (partial and overpayment), credit notes, void
- Client portal: list, detail, PDF, "I've paid"
- Dashboard, aging, revenue and tax reports, CSV export
- Audit log on send, void, credit, payment, and token rotation

Planned for v2: online payments, FX, recurring invoices, reminders, staff users.

## Tech stack

Angular and Supabase only. There is no separate backend service.

| Layer          | Choice                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Web            | Angular 20+ (standalone components, signals, SSR for the portal)                                                        |
| Data access    | `supabase-js` from Angular (PostgREST + RPC)                                                                            |
| Business logic | Postgres functions (RPC) for send, void, payments, credit notes, portal reads                                           |
| Preview logic  | `packages/domain` (Money, Tax, status machines, validators) for live UI totals; the database recomputes authoritatively |
| Database       | Supabase Postgres (constraints, triggers, RLS)                                                                          |
| Auth           | Supabase Auth                                                                                                           |
| Files          | Supabase Storage (private buckets, signed URLs)                                                                         |
| Jobs           | Edge Functions (PDF, email) + `pg_cron` (drift check)                                                                   |
| Tests          | Vitest (unit/property), pgTAP (DB), Playwright (E2E), axe (a11y)                                                        |

## Repository layout

```
.
├── apps/
│   └── web/          # Angular app (owner shell + portal)
├── packages/
│   └── domain/       # Pure TS: Money, Tax, state machines, validators
├── supabase/
│   ├── migrations/   # tables, RLS, RPC functions
│   ├── functions/    # Edge Functions (PDF, email)
│   ├── tests/        # pgTAP
│   └── seed.sql
├── docs/
│   ├── requirements.md
│   └── ui-sketch.html
├── Documentation.md
├── todo.md
└── README.md
```

## Getting started

Prerequisites: Node 22+, pnpm 9+, Supabase CLI, Docker (for local Supabase).

```bash
# 1. install
pnpm install

# 2. start local Supabase (Postgres, Auth, Storage)
supabase start

# 3. configure env
cp apps/web/src/environments/environment.example.ts apps/web/src/environments/environment.ts
# fill in URL and anon key from `supabase status`
cp supabase/.env.example supabase/.env   # Edge Function secrets (local)

# 4. apply migrations and seed
supabase db reset

# 5. run everything
supabase functions serve &
pnpm dev          # web on :4200
```

## Scripts

| Command          | Purpose                                    |
| ---------------- | ------------------------------------------ |
| `pnpm dev`       | Run the Angular app in watch mode          |
| `pnpm test`      | Unit and property tests                    |
| `pnpm test:db`   | pgTAP database tests (`supabase test db`)  |
| `pnpm test:e2e`  | Playwright journeys                        |
| `pnpm lint`      | ESLint + boundary rules                    |
| `pnpm typecheck` | TypeScript across the workspace            |
| `pnpm build`     | Production builds with bundle-size budgets |
| `pnpm db:reset`  | Recreate the local database                |

## Environment variables

| Variable                    | Used by             | Notes                                           |
| --------------------------- | ------------------- | ----------------------------------------------- |
| `SUPABASE_URL`              | web, edge functions | Public                                          |
| `SUPABASE_ANON_KEY`         | web                 | Public                                          |
| `SUPABASE_SERVICE_ROLE_KEY` | edge functions only | Injected by Supabase; never ship to the browser |
| `APP_BASE_URL`              | edge functions      | Used in portal links                            |
| `PORTAL_TOKEN_PEPPER`       | database (Vault)    | Secret for token hashing                        |
| `EMAIL_API_KEY`             | edge functions      | Provider TBD                                    |

## Documentation

- [`Documentation.md`](./Documentation.md): architecture, domain rules, data model, RPC surface, conventions
- [`todo.md`](./todo.md): roadmap and checklist
- `docs/requirements.md`: full requirements spec

## Contributing

Solo project for now. Conventions: conventional commits, small PRs, domain logic goes in `packages/domain` with tests before any UI uses it.

## License

TBD.
