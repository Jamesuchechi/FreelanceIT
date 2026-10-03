# FreelanceIT — TODO

Legend: `[ ]` open · `[x]` done · **(M)** must for v1 · **(S)** should · **(C)** could / v2
IDs in brackets map to the requirements spec (e.g. `INV-7`).

## Decisions to close first (blockers)

- [x] Backend: Angular + Supabase only (RLS, Postgres RPC, Edge Functions, pg_cron); no separate API service
- [ ] Money math: TS preview in `packages/domain`, SQL authoritative at send, parity tests on shared fixtures
- [x] Tax scope: multiple rates per invoice (one tax mode per invoice)
- [ ] Confirm rounding rule: per-line total rounded half away from zero; tax computed once per rate group and rounded once
- [ ] PDF approach: Edge Function render from the frozen snapshot (PDF lib; Chromium not available in Edge Functions)
- [ ] Project-less expenses allowed in v1? (client-level expense)
- [ ] Email provider for sending invoices (Resend / Postmark / SES)
- [ ] Hosting: Angular SSR portal (Vercel/Netlify/Cloudflare), Supabase region
- [ ] Final name, domain, and logo

## M0 — Foundation

- [x] Workspace (pnpm): `apps/web`, `packages/domain`, `supabase/`
- [x] TypeScript strict, ESLint, Prettier, EditorConfig, commit hooks
- [x] CI: lint, typecheck, unit tests, build, bundle-size budget **(M)**
- [x] Lint rule: `features/portal` cannot import `features/invoices/builder` **(M)**
- [x] `packages/domain`: `Money` (integer minor units + currency, exponent aware) **(M)**
- [x] `packages/domain`: `Tax` pure functions (per-line, per-rate-group, inclusive/exclusive) **(M)**
- [x] `packages/domain`: pro-rata discount allocation (largest-remainder) **(M)**
- [x] `packages/domain`: invoice/time/expense status machines **(M)**
- [x] `packages/domain`: validators (dates, qty > 0, ≥ 1 line, currency lock)
- [x] Property tests: parts sum to total, no drift, rounding stable, 0/2/3-decimal currencies **(M)**
- [x] Supabase project + local dev (CLI), migrations folder, seed script, pgTAP set up
- [x] Shared test fixtures for TS and SQL money math (parity tests) **(M)**
- [x] `.env.example` and secrets policy documented

## M1 — Auth, shell, settings

- [ ] DB: `owner`, `business_profile`, `numbering_series`, `tax_preset`
- [ ] RLS on owner tables by `auth.uid()`; owner scoping tests **(M)**
- [ ] Angular: app shell, lazy routes, layout, theme tokens (light/dark) **(M)**
- [ ] `authGuard`, session refresh, sign-in / magic link (AUTH-1) **(M)**
- [ ] `SupabaseService` wrapper: error-code mapping, idempotency keys, loading bar; HTTP interceptor for plain calls **(M)**
- [ ] Settings: business profile, logo upload, bank details (AUTH-2) **(M)**
- [ ] Settings: numbering series (prefix, year reset, padding) (AUTH-3) **(M)**
- [ ] Settings: tax presets with label, rate (bp), inclusive flag, default (AUTH-4) **(M)**
- [ ] Settings: default terms, footer notes (AUTH-5) **(S)**
- [ ] Global toast + error boundary, empty/loading/error component set

## M2 — Clients, projects, rates

- [ ] DB + RLS: `client`, `contact`, `project`, rate fields
- [ ] Client CRUD, archive instead of delete (CLI-1, CLI-3) **(M)**
- [ ] Currency lock once a sent invoice exists (CLI-2) **(M)**
- [ ] Client detail: balance, unbilled, invoices, activity timeline (CLI-4) **(M)**
- [ ] Project CRUD with budget and rate override (PRJ-1) **(M)**
- [ ] Budget meter, warning at 80% (PRJ-2) **(S)**
- [ ] Rate resolution: entry → project → client → global (RATE-1) **(M)**
- [ ] Resolvers prefetch client + projects for detail routes
- [ ] Reusable data table: sort, filter, cursor pagination, saved views **(S)**

## M3 — Capture and unbilled queue

- [ ] DB: `time_entry`, `expense`, `attachment`
- [ ] Timer service (signals): start/stop, one running timer, persisted locally (TIME-1, TIME-3) **(M)**
- [ ] Manual time entry with flexible duration parsing (`1h30`, `1.5`, `90m`) (TIME-2) **(M)**
- [ ] Rounding rule per client (none / 6 / 15 min) (TIME-4) **(S)**
- [ ] Expense form + receipt upload (5 MB, jpg/png/pdf) via signed URL (EXP-1, EXP-2) **(M)**
- [ ] Unbilled queue per client, grouped by project (QUEUE-1) **(M)**
- [ ] Write-off with required reason (QUEUE-2) **(M)**
- [ ] Offline queue for timer stop and new entries, replay with idempotency keys **(M)**
- [ ] Weekly timesheet grid (TIME-5) **(C)**

## M4 — Invoice builder and send

- [ ] DB: `invoice`, `invoice_line`, `audit`; constraints and status-transition checks
- [ ] Create draft from unbilled selection via resolver (INV-1) **(M)**
- [ ] Builder form: header, FormArray/signal-form lines, reorder with CDK drag-drop **(M)**
- [ ] Manual lines and fixed fees (INV-2) **(M)**
- [ ] Per-line tax with snapshot; invoice-level tax mode (inclusive/exclusive) **(M)**
- [ ] Totals panel: subtotal, discount, tax per rate group, total, balance (INV-5) **(M)**
- [ ] Discount percent/fixed, spread pro-rata across lines (INV-4) **(M)**
- [ ] Autosave with `updated_at` optimistic concurrency, conflict banner and review (INV-6) **(M)**
- [ ] `unsavedChangesGuard`, `draftOnlyGuard` (sent invoice redirects to read-only view) **(M)**
- [ ] `send_invoice` RPC: transaction → number allocation → freeze lines → lock rows → audit; SQL recomputes totals (INV-7) **(M)**
- [ ] Idempotent send (INV-8) **(M)**
- [ ] PDF Edge Function from frozen snapshot; byte-stable regeneration **(M)**
- [ ] Send dialog: number preview, recipients, lock warning
- [ ] Email invoice with portal link + PDF (INV-9) **(S)**
- [ ] Duplicate invoice (INV-10) **(S)**
- [ ] Read-only invoice view with PDF preview

## M5 — Payments, credits, void

- [ ] DB: `payment`, `credit_note`, `client_credit`
- [ ] Record payment: partial allowed, idempotency key (PAY-1, PAY-4) **(M)**
- [ ] Derived statuses: partially paid, paid, overdue (query-time) **(M)**
- [ ] Reverse payment with reason (PAY-3) **(M)**
- [ ] Overpayment → client credit and apply-to-next-invoice (PAY-2) **(S)**
- [ ] Credit note flow with own numbering series and PDF (CN-1) **(M)**
- [ ] Void rules: only with no payments/credits; release time + expenses (INV-11) **(M)**
- [ ] Audit log viewer per document (AUD-1) **(M)**
- [ ] Reserve model room for "withheld by client" amounts **(C)**

## M6 — Portal

- [ ] DB: `portal_token` (hashed), view tracking
- [ ] `portal_*` RPC functions for the anonymous role; uniform not-found for bad tokens (POR-6) **(M)**
- [ ] Angular SSR app/route for `/p/:token` with `tokenGuard` **(M)**
- [ ] Invoice list, detail, PDF download (POR-1, POR-2) **(M)**
- [ ] Rotate / revoke / expire token, friendly expired page (POR-4, POR-5) **(M)**
- [ ] "I've paid" claim → owner confirms (POR-3) **(S)**
- [ ] Rate limiting on portal RPCs (attempt table)
- [ ] Verify portal bundle contains no owner code

## M7 — Dashboard, reports, exports

- [ ] Dashboard: outstanding, overdue, paid this month, unbilled (RPT-1) **(M)**
- [ ] Reconciliation test: dashboard equals invoice-list balances (RPT-6) **(M)**
- [ ] Aging report (RPT-2) **(S)**
- [ ] Revenue by client / project / month (RPT-3) **(S)**
- [ ] Tax summary grouped by label and rate (RPT-4) **(S)**
- [ ] CSV export on every list and report (RPT-5) **(M)**
- [ ] Global search with keyboard shortcut (SRCH-1) **(S)**
- [ ] Full data export + account deletion (AUTH-6) **(S)**
- [ ] Soft delete + undo for drafts and unbilled rows (UNDO-1) **(S)**

## M8 — Hardening and release

- [ ] Row-level security review: every table, with negative tests **(M)**
- [ ] Portal enumeration test: token A cannot read client B **(M)**
- [ ] Playwright journeys: capture → bill → send → pay; void; credit; token rotation **(M)**
- [ ] The 12 "done" scenarios from the spec pass **(M)**
- [ ] Accessibility pass (axe + manual keyboard + screen reader) **(M)**
- [ ] Performance budgets verified (shell ≤ 200 KB, lazy features ≤ 100 KB) **(M)**
- [ ] Error tracking, structured logs, uptime check
- [ ] Backups + tested restore
- [ ] Nightly `pg_cron` job: recompute sent-invoice totals from lines, alert on drift
- [ ] Security headers/CSP, dependency audit in CI
- [ ] Seed/demo data and a short demo script

## v2 backlog

- [ ] Online payments with processor webhook (PAY-5)
- [ ] Credit-note and refund polish
- [ ] FX: store original amount, rate, rate date, converted minor units
- [ ] Recurring invoices (REC-1)
- [ ] Reminder schedule and templates (REM-1)
- [ ] Quotes → convert to invoice
- [ ] Withholding tax handling
- [ ] Multi-user staff with their own time entries
- [ ] Expense markup (EXP-3)

## UI still to sketch

- [ ] Client list and client detail
- [ ] Project view
- [ ] Send dialog, payment dialog, credit note dialog
- [ ] Settings screens
- [ ] Empty, error, and offline states for the timer
- [ ] Mobile layouts for timer and expenses
