# FreelanceIT — Requirements Spec v2

_A ledger with a client door. Pre-UI: scope, rules, requirements, data, architecture._

## 1. Principles (the tie-breakers)

1. **One money trail.** Time/expenses → invoice lines → payments/credits. Every number shown is derived from it.
2. **Sent means immutable.** Corrections are new documents (credit note, void + reissue), never edits.
3. **Integers only.** Money = integer minor units + ISO currency. No floats anywhere, including the DB.
4. **Snapshots over references.** Anything that must not change later (tax rate, rate, client name/address, bank details) is copied onto the document at issue time.
5. **Server is the authority.** Angular validates for UX; the database enforces for truth.

## 2. Scope

**Personas:** Owner (the freelancer) and Client (portal viewer, no account). **In v1:** owner auth, clients, projects, rate cards, timer + manual time, expenses with receipts, unbilled queue, draft → send, PDF, manual payments, credit notes, void, portal (view, PDF, mark/record payment), dashboard, CSV export, audit log. **v2:** online payments, FX, recurring invoices, reminders, quotes, multi-user staff. **Non-goals:** payroll, double-entry accounting, inventory, multi-tenant agencies, tax filing.

## 3. Glossary and statuses

| Entity               | States                                         | Notes                                                                                         |
| -------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Time entry / Expense | `draft → invoiced`, `draft → written_off`      | Invoiced rows locked; voiding an invoice releases them back to `draft`                        |
| Invoice              | `draft → sent → partially_paid → paid`, `void` | `overdue` is derived: `status in (sent, partially_paid) AND due_date < today AND balance > 0` |
| Credit note          | `issued`                                       | Always attached to a sent invoice                                                             |
| Payment              | `recorded`, `reversed`                         | Reversal is a new row, never a delete                                                         |

**Balance** = invoice total − payments − credit notes. Always computed, never stored as editable.

## 4. Functional requirements

Priority: **M** must (v1), **S** should (v1 if time), **C** could (v2).

### 4.1 Auth and settings

| ID     | Requirement                                                                             | P   |
| ------ | --------------------------------------------------------------------------------------- | --- |
| AUTH-1 | Owner signs in by email + password or magic link; sessions expire; refresh is silent    | M   |
| AUTH-2 | Business profile: name, address, tax id, logo, bank details, default currency, timezone | M   |
| AUTH-3 | Invoice numbering: prefix, year reset, padding (`INV-2026-0042`)                        | M   |
| AUTH-4 | Tax presets (label, rate, inclusive/exclusive), one default                             | M   |
| AUTH-5 | Default payment terms (net 7/14/30) and invoice footer/notes                            | S   |
| AUTH-6 | Full data export (JSON + CSV) and account deletion                                      | S   |

### 4.2 Clients and projects

| ID     | Requirement                                                                                                                      | P   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- | --- |
| CLI-1  | CRUD client: legal name, contact(s), billing address, currency, tax id, terms, default rate                                      | M   |
| CLI-2  | Currency locked once the client has any sent invoice                                                                             | M   |
| CLI-3  | Archive instead of delete when the client has history                                                                            | M   |
| CLI-4  | Client page: balance, unbilled total, invoice list, activity timeline                                                            | M   |
| PRJ-1  | Project: client, name, status (active/paused/done), budget (hours or amount), rate override                                      | M   |
| PRJ-2  | Budget meter: used vs budget, warning at 80%, never blocks work                                                                  | S   |
| RATE-1 | Rate resolution order: time entry override → project → client → global default; resolved rate is stored on the entry when billed | M   |

### 4.3 Capture

| ID      | Requirement                                                                                        | P   |
| ------- | -------------------------------------------------------------------------------------------------- | --- |
| TIME-1  | Start/stop timer on a project; one running timer at a time                                         | M   |
| TIME-2  | Manual entry: date, duration (accepts `1h30`, `1.5`, `90m`), note, billable flag                   | M   |
| TIME-3  | Timer survives refresh/offline (local interval persisted, synced on reconnect)                     | M   |
| TIME-4  | Edit/delete allowed only while `draft`; rounding rule per client (none / 6 / 15 min, up)           | S   |
| TIME-5  | Weekly timesheet grid                                                                              | C   |
| EXP-1   | Expense: date, amount, currency, category, project/client, billable flag, note                     | M   |
| EXP-2   | Receipt upload (jpg/png/pdf, max 5 MB) to object storage, preview, replace                         | M   |
| EXP-3   | Optional markup % when billed to client                                                            | C   |
| QUEUE-1 | Unbilled queue per client: all `draft` billable time and expenses, grouped by project, with totals | M   |
| QUEUE-2 | Write off a row with a required reason                                                             | M   |

### 4.4 Billing

| ID     | Requirement                                                                                                  | P   |
| ------ | ------------------------------------------------------------------------------------------------------------ | --- |
| INV-1  | Create draft from the unbilled queue; include/exclude per row, bulk select per project                       | M   |
| INV-2  | Manual lines (fixed fee, retainer, discount line)                                                            | M   |
| INV-3  | Line: description, qty, unit, unit price, tax snapshot, computed total; reorderable                          | M   |
| INV-4  | Document discount: percent or fixed, applied before tax, rule documented below                               | M   |
| INV-5  | Live totals: subtotal, discount, tax grouped by rate, total, balance                                         | M   |
| INV-6  | Draft autosave with optimistic concurrency (`updated_at`); conflict dialog shows what changed                | M   |
| INV-7  | Send: validate, allocate gapless number in a transaction, freeze lines, generate PDF, lock rows, write audit | M   |
| INV-8  | Send is idempotent (same key twice returns the same invoice)                                                 | M   |
| INV-9  | Email invoice to client contacts with portal link and PDF attached; log delivery status                      | S   |
| INV-10 | Duplicate any invoice into a new draft                                                                       | S   |
| INV-11 | Void: only when no payments or credits; keeps number, watermarks PDF, releases time/expenses                 | M   |
| CN-1   | Credit note: amount ≤ remaining balance, reason, own number (`CN-2026-0003`), PDF                            | M   |
| PAY-1  | Record payment: amount, date, method, reference; partial allowed                                             | M   |
| PAY-2  | Overpayment becomes client credit, applicable to the next invoice                                            | S   |
| PAY-3  | Reverse a payment (new row, reason, audit)                                                                   | M   |
| PAY-4  | Payment idempotency key on every write path                                                                  | M   |
| PAY-5  | Online payment via processor webhook                                                                         | C   |
| REC-1  | Recurring invoice templates with auto-draft (not auto-send)                                                  | C   |
| REM-1  | Reminder schedule (before due, on due, +7, +14) with templates                                               | C   |

### 4.5 Portal (`/p/:token`)

| ID    | Requirement                                                                                   | P   |
| ----- | --------------------------------------------------------------------------------------------- | --- |
| POR-1 | Token scoped to one client; shows that client's sent/paid/void invoices only                  | M   |
| POR-2 | Invoice detail, balance, payment instructions, PDF download                                   | M   |
| POR-3 | "I've paid" notice from client creates a _pending_ payment claim; owner confirms              | S   |
| POR-4 | Owner can rotate or revoke the token; old links return a friendly expired page                | M   |
| POR-5 | Token expiry option; view tracking (first viewed, last viewed) shown to owner                 | S   |
| POR-6 | Portal reveals nothing else: no other clients, no owner internals, uniform 404 for bad tokens | M   |

### 4.6 Reports and dashboard

| ID    | Requirement                                                                 | P   |
| ----- | --------------------------------------------------------------------------- | --- |
| RPT-1 | Dashboard: outstanding, overdue, paid this month, unbilled hours and amount | M   |
| RPT-2 | Aging buckets (current, 1–30, 31–60, 61–90, 90+) per client                 | S   |
| RPT-3 | Revenue by client / project / month, with date-range filter                 | S   |
| RPT-4 | Tax summary per period (collected by rate)                                  | S   |
| RPT-5 | CSV export for every list and report                                        | M   |
| RPT-6 | Dashboard numbers reconcile with the invoice list at all times (tested)     | M   |

### 4.7 Cross-cutting

| ID      | Requirement                                                                                    | P   |
| ------- | ---------------------------------------------------------------------------------------------- | --- |
| AUD-1   | Audit row on send, void, credit, payment, reversal, token rotation: actor, time, before, after | M   |
| SRCH-1  | Global search (clients, invoices by number, projects) with keyboard shortcut                   | S   |
| NOTIF-1 | In-app toasts for outcomes; email only for client-facing sends                                 | M   |
| UNDO-1  | Undo toast for deletes of drafts and unbilled rows (soft delete, 30 days)                      | S   |

## 5. Business rules (decide these now, they are expensive to change later)

1. **Rounding:** compute each line total in integer minor units, round half away from zero per line, then sum. Tax is computed per tax group on the sum of net lines, rounded once per group. Document it in code and test it.
2. **Discount order:** document-level discount is spread pro-rata across taxable lines before tax, so tax stays correct with mixed rates.
3. **Inclusive tax:** net = gross ÷ (1 + rate); the remainder is tax, so net + tax always equals gross.
4. **Numbering:** allocated only at send, per series (invoice and credit note separate), inside the same transaction as the status change. Void keeps its number. Gaps are therefore impossible except by DB failure, which rolls back.
5. **Dates:** due date = issue date + terms, stored as a date (not timestamp) in the owner's timezone. Overdue flips at the end of the due date.
6. **Currency:** one currency per invoice, equal to the client's. Mixed-currency expenses are v2.
7. **Rate change:** affects only unbilled and future work. Never touches frozen lines.
8. **Void vs credit:** void if untouched, credit note if any payment exists. A paid invoice can never be voided.
9. **Payments:** cannot exceed balance unless flagged as overpayment; payment date cannot be before issue date.
10. **Deletion:** nothing sent is ever deleted. Drafts are soft-deleted.

## 6. Non-functional requirements

### Correctness and integrity

- DB constraints mirror the rules: check constraints (amount ≥ 0, status transitions), unique `(owner_id, series, number)`, foreign keys with restrict.
- Status transitions through a single server function/RPC; no client writes status directly.
- Property tests on the Tax/Money functions (sum of parts = total, rounding stable, no float drift).

### Security and privacy

- Row-level security on every table by `owner_id`; portal access via a server function that takes the token, never a broad read policy.
- Tokens: 128-bit random, stored as a hash, constant-time compare, rate-limited, rotatable.
- Receipts and PDFs in private buckets; access through short-lived signed URLs.
- OWASP basics: CSP, no inline scripts, output encoding, CSRF-safe auth flow, dependency audit in CI.
- PII minimised; data export and deletion supported (NDPR/GDPR-aligned).
- Secrets only server-side; the Angular bundle contains only public keys.

### Performance (targets on mid-range mobile, 4G)

- Initial owner shell ≤ 200 KB gzipped JS; each lazy feature ≤ 100 KB.
- LCP ≤ 2.5 s on the portal; INP ≤ 200 ms in the builder.
- Invoice builder recalculates totals in under 16 ms for 200 lines.
- List endpoints paginated (cursor), default 25; dashboard queries under 300 ms at 10k invoices.
- Virtual scroll for lists above 100 rows.

### Reliability and offline

- Timer works offline; queued mutations replay in order with idempotency keys.
- Every write path is retry-safe. Network errors never produce duplicate rows.
- Daily automated DB backup, tested restore, PDF regeneration from the frozen snapshot is byte-stable.

### Usability and accessibility

- WCAG 2.2 AA: keyboard-complete builder, focus management in dialogs, visible focus, 4.5:1 contrast, screen-reader labels on money and status.
- Responsive: portal is mobile-first; the owner app is fully usable on a phone (timer and expenses especially).
- Dark mode via design tokens. No color-only status indicators.
- Empty, loading, error, and offline states specified for every list and form.

### Internationalisation

- Locale-aware money, dates, numbers through one pipe; strings externalised from day one (Angular i18n or Transloco), English only at launch.
- Multiple tax presets, currency minor-unit exponent respected (0, 2, 3 decimals).

### Observability and operability

- Structured logs with request IDs, error tracking (Sentry), uptime check on the portal.
- Audit log is append-only and queryable by document.
- Feature flags for v2 items; migrations are forward-only and reviewed.

### Maintainability and quality

- TypeScript strict, ESLint, Prettier, no `any` in domain code.
- Domain logic (Money, Tax, status machine, numbering) in a pure library with no Angular imports.
- Test pyramid: unit (domain, ≥ 95%), component tests for the builder, a handful of Playwright E2E journeys.
- CI: lint, typecheck, test, build, bundle-size budget, accessibility check (axe) on key pages.

## 7. Data model sketch

```
owner(id, business_profile, settings, numbering_series[])
client(id, owner_id, legal_name, currency, tax_id, terms_days, default_rate, archived_at)
contact(id, client_id, name, email, is_primary)
portal_token(id, client_id, token_hash, expires_at, revoked_at, last_viewed_at)
project(id, client_id, name, status, budget_type, budget_value, rate_override)
time_entry(id, project_id, date, minutes, note, billable, status, rate_snapshot, invoice_line_id?)
expense(id, project_id|client_id, date, amount_minor, currency, category, billable, receipt_id, status, invoice_line_id?)
invoice(id, client_id, number?, status, issue_date, due_date, currency, client_snapshot, seller_snapshot,
        discount_type, discount_value, subtotal_minor, discount_minor, tax_minor, total_minor, notes, updated_at)
invoice_line(id, invoice_id, position, description, qty_milli, unit, unit_price_minor, tax_label, tax_rate_bp, tax_inclusive, total_minor, source_type, source_id)
payment(id, invoice_id, amount_minor, date, method, reference, idempotency_key, reversed_of?)
credit_note(id, invoice_id, number, amount_minor, reason)
client_credit(id, client_id, amount_minor, source_payment_id, applied_to?)
audit(id, entity, entity_id, action, actor, at, before, after)
attachment(id, owner_id, path, mime, size)
```

Quantities are stored as integer thousandths, tax rates as basis points. Totals on a sent invoice are stored (they are a snapshot), and a nightly check recomputes them from the lines to catch drift.

## 8. Data access surface (Angular + Supabase, no separate backend)

- **Owner (Supabase session, RLS):** tables `clients`, `projects`, `time_entries`, `expenses`, settings via CRUD; RPC functions for `unbilled_queue`, `save_invoice_draft`, `send_invoice`, `void_invoice`, `duplicate_invoice`, `issue_credit_note`, `record_payment`, `reverse_payment`, `report_*`. Edge Functions for PDF and email.
- **Portal (token, anonymous role):** RPC only: `portal_list_invoices`, `portal_get_invoice`, `portal_invoice_pdf`, `portal_payment_claim`. No table access for the anonymous role.
- **Conventions:** idempotency key argument on all RPCs that create money records, `expected_updated_at` argument on draft save, exceptions with stable codes (`INVOICE_LOCKED`, `STALE_DRAFT`, `OVERPAYMENT`).

## 9. Angular architecture

- Standalone components, signals for local state, `computed` for line and total math, RxJS only for streams (search debounce, polling, timer sync).
- Folders: `core/` (auth, http, interceptors), `domain/` (pure Money, Tax, status machine), `shared/` (UI, pipes), `features/{clients,work,invoices,reports,portal}` lazy by route.
- Boundary rule enforced by lint: `features/portal` may not import `features/invoices/builder`.
- Guards: `authGuard`, `draftOnlyGuard`, `tokenGuard`, `unsavedChangesGuard`. Resolvers for client + unbilled queue.
- Interceptors/data layer: a Supabase service wrapper for idempotency keys, error mapping, global loading, and read-only retry with backoff; an HTTP interceptor for plain HTTP calls.
- State: feature-level signal stores; no global store until one is clearly needed.
- Forms: typed reactive/signal forms, validators in `domain/`, error messages from one map.

## 10. Test scenarios that define "done"

1. Double-click Send → one invoice, one number.
2. Two tabs edit one draft → second save gets a conflict, nothing lost.
3. Change tax rate after send → old PDF bytes unchanged.
4. Void with a payment → rejected; credit note path works.
5. Pay 60% then 40% → statuses `partially_paid` then `paid`, balance 0.
6. Overpay by 10% → client credit created, invoice paid.
7. Rotate token → old link returns expired page, new link works.
8. Client A's token cannot read Client B's invoice by ID guessing.
9. Dashboard totals equal sum of invoice list balances.
10. Timer stopped offline → entry appears after reconnect, no duplicate.
11. 0-decimal and 3-decimal currencies render and round correctly.
12. Delete a project with billed time → blocked with explanation.

## 11. Milestones

| M   | Deliverable                                                 | Angular concepts exercised              |
| --- | ----------------------------------------------------------- | --------------------------------------- |
| 0   | Repo, CI, domain lib (Money, Tax, state machine) with tests | TS, project structure                   |
| 1   | Auth, shell, settings, lazy routes                          | Router, guards, interceptors            |
| 2   | Clients, projects, rates                                    | Forms, resolvers, tables                |
| 3   | Timer, time, expenses, receipts, unbilled queue             | Signals, RxJS, file upload              |
| 4   | Invoice builder, send, PDF, numbering                       | FormArray/signal forms, validators, CDK |
| 5   | Payments, credit notes, void, audit                         | Optimistic concurrency, idempotency     |
| 6   | Portal (SSR), token flows                                   | SSR, hydration, token guard             |
| 7   | Dashboard, reports, exports                                 | Computed signals, virtual scroll        |
| 8   | Hardening: a11y, perf budgets, E2E, backups                 | Playwright, axe, bundle budgets         |

## 12. Open decisions (resolve before UI)

1. ~~Backend~~ **Decided:** Angular + Supabase only (RLS, RPC functions, Edge Functions, pg_cron). Number allocation and send live in Postgres RPC.
2. PDF: Edge Function render from the frozen snapshot (recommended) vs client library.
3. Tax scope for v1: multiple rates per invoice (decided).
4. Rounding rule in section 5: confirm or change.
5. Does v1 allow a project-less expense (client-level)?
6. Email sending provider for INV-9.
7. Hosting for the SSR portal (Supabase does not host Angular SSR).
8. Money math duplication: TS for preview, SQL authoritative at send, with parity tests (proposed).
