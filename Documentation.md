# FreelanceIT — Documentation

Technical reference for architecture, domain rules, data, RPC surface, and conventions. For the product overview see `README.md`; for the roadmap see `todo.md`.

## Contents

1. [System overview](#1-system-overview)
2. [Domain model and statuses](#2-domain-model-and-statuses)
3. [Money and tax rules](#3-money-and-tax-rules)
4. [Workflows](#4-workflows)
5. [Data model](#5-data-model)
6. [Data access and RPC surface](#6-data-access-and-rpc-surface)
7. [Security](#7-security)
8. [Angular architecture](#8-angular-architecture)
9. [Quality: testing and budgets](#9-quality-testing-and-budgets)
10. [Operations](#10-operations)
11. [Conventions](#11-conventions)
12. [Glossary](#12-glossary)

---

## 1. System overview

```
┌────────────┐  supabase-js   ┌────────────────────────────┐
│ Angular web│ ─────────────► │ Supabase                   │
│ owner + SSR│ ◄───────────── │  Postgres (tables, RLS,    │
│ portal     │                │   RPC functions, triggers) │
└─────┬──────┘                │  Auth · Storage            │
      │ imports               │  Edge Functions (PDF,      │
      ▼                       │   email) · pg_cron         │
 packages/domain              └────────────────────────────┘
 (preview math, validators)
```

- **No separate backend.** Angular talks to Supabase directly: PostgREST for simple reads and writes, RPC functions for every operation with business rules.
- **Two audiences.** Owner access needs a session and is scoped by RLS. Portal access goes through token-taking RPC functions callable by the anonymous role, and can only read.
- **Two implementations of the money math, one source of truth.** `packages/domain` drives live totals in the builder. The `send` RPC recomputes totals in SQL and is authoritative. Parity tests run the same fixtures against both and must agree to the minor unit.
- **The database is the authority**: constraints, triggers, unique numbering, RLS, and RPC-only status transitions.

## 2. Domain model and statuses

Write models: Client, Project, Rate card, Time entry, Expense, Invoice (+ lines), Payment, Credit note. Everything else is a view.

| Entity               | States                                         | Rules                                                                   |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| Time entry / Expense | `draft → invoiced`, `draft → written_off`      | Invoiced rows are locked. Voiding the invoice returns them to `draft`.  |
| Invoice              | `draft → sent → partially_paid → paid`, `void` | `sent` is immutable.                                                    |
| Overdue              | derived                                        | `status in (sent, partially_paid) AND due_date < today AND balance > 0` |
| Payment              | `recorded`, `reversed`                         | A reversal is a new row referencing the original.                       |
| Credit note          | `issued`                                       | Always tied to a sent invoice, own numbering series.                    |

**Balance** = total − payments (net of reversals) − credit notes. It is computed, never edited.

**Void vs credit:** void only when nothing is paid or credited; otherwise issue a credit note. A paid invoice can never be voided. Voided invoices keep their number.

## 3. Money and tax rules

### 3.1 Money

- Stored as `amount_minor` (integer) plus `currency` (ISO 4217). Currency exponent (0, 2, 3) comes from a lookup in `packages/domain`.
- Quantities are integer thousandths (`qty_milli`). Tax rates are basis points (`tax_rate_bp`, 7.5% = 750).
- No `number`/float arithmetic on money in domain code or SQL. Use integer math (`bigint`/`numeric` with explicit rounding helpers in SQL) with explicit rounding.
- One currency per invoice, equal to the client's currency. Locked once the client has a sent invoice.

### 3.2 Line totals

```
line_net = round_half_away_from_zero(qty_milli * unit_price_minor / 1000)
```

### 3.3 Discount

Document discount is percent or fixed. It is allocated across lines **pro-rata by line net** using the largest-remainder method, so the allocated pieces always sum exactly to the discount. Tax is computed on the discounted net.

### 3.4 Tax (multiple rates per invoice)

- Each line carries a tax snapshot: `tax_label`, `tax_rate_bp`, and the invoice carries one `tax_mode` (`exclusive` or `inclusive`). Mixing modes on one invoice is not allowed.
- Group lines by `(tax_label, tax_rate_bp)`. For each group:
  - **Exclusive:** `tax = round(group_net_after_discount * rate_bp / 10000)`
  - **Inclusive:** `net = round(gross * 10000 / (10000 + rate_bp))`, `tax = gross − net`, so net + tax always equals gross.
- Tax is rounded **once per group**, then groups are summed.
- Zero-rated and exempt are separate labels at 0% so reports can tell them apart.
- No compound or stacked tax in v1.

### 3.5 Worked example (exclusive)

| Line                 | Net     | Tax label |
| -------------------- | ------- | --------- |
| Time 18.5 h × 25,000 | 462,500 | VAT 7.5%  |
| Stock images         | 38,000  | VAT 7.5%  |
| Domain               | 20,000  | Exempt 0% |
| Hosting setup        | 80,000  | VAT 7.5%  |

Subtotal 600,500 · discount 5% = 30,025 · net after discount 570,475
VAT group net (580,500 × 0.95) = 551,475 → tax 41,361 (41,360.6 rounded)
**Total = 570,475 + 41,361 = 611,836**

(Amounts shown in major units for readability; stored as minor units.)

### 3.6 Rate resolution

Entry override → project → client → global default. The resolved rate is written onto the entry when it is billed. A rate change never touches frozen invoice lines.

## 4. Workflows

### 4.1 Capture

Timer or manual time, and expenses with receipts, land as `draft` rows in the client's unbilled queue. The timer persists locally and syncs when online; every create carries an idempotency key.

### 4.2 Bill

1. Pick a client; the builder loads the unbilled queue (resolver).
2. Include, exclude, or write off rows (write-off requires a reason).
3. Included rows are copied into `invoice_line` with source references.
4. Draft autosaves with optimistic concurrency.
5. **Send** runs in one transaction:
   - validate invariants (≥ 1 line, due ≥ issue, qty > 0, currency matches client)
   - allocate the next number in the series (row lock on the series)
   - freeze lines, tax snapshot, client and seller snapshots, and totals
   - mark source rows `invoiced`
   - write the audit row
   - enqueue PDF generation and optional email
6. Send is idempotent: repeating the same key returns the same invoice.

### 4.3 Collect

The owner records a payment (amount, date, method, reference) or confirms a client "I've paid" claim. Partial payments are normal. Overpayment becomes client credit. Every payment write requires an idempotency key.

### 4.4 Correct

Void (no money applied) or credit note. Both preserve the original document and write audit rows.

### 4.5 Numbering

Gapless per series (`INV-2026-0042`, `CN-2026-0003`), allocated only at send, never at draft creation. Failed transactions roll back the allocation, so gaps cannot occur from application errors.

## 5. Data model

```
owner(id, ...)
business_profile(owner_id, name, address, tax_id, logo_id, bank_details, default_currency, timezone)
numbering_series(id, owner_id, kind[invoice|credit], prefix, year, next_seq, padding)
tax_preset(id, owner_id, label, rate_bp, is_default)

client(id, owner_id, legal_name, currency, tax_id, terms_days, default_rate_minor, archived_at)
contact(id, client_id, name, email, is_primary)
portal_token(id, client_id, token_hash, expires_at, revoked_at, last_viewed_at)

project(id, client_id, name, status, budget_type, budget_value, rate_override_minor)
time_entry(id, project_id, date, minutes, note, billable, status, rate_snapshot_minor, invoice_line_id)
expense(id, project_id, client_id, date, amount_minor, currency, category, billable, receipt_id, status, invoice_line_id)

invoice(id, client_id, number, status, issue_date, due_date, currency, tax_mode,
        client_snapshot, seller_snapshot, discount_type, discount_value,
        subtotal_minor, discount_minor, tax_minor, total_minor, notes, updated_at)
invoice_line(id, invoice_id, position, description, qty_milli, unit, unit_price_minor,
             discount_alloc_minor, tax_label, tax_rate_bp, line_net_minor, source_type, source_id)
invoice_tax_group(invoice_id, tax_label, tax_rate_bp, net_minor, tax_minor)

payment(id, invoice_id, amount_minor, date, method, reference, idempotency_key, reversed_of)
credit_note(id, invoice_id, number, amount_minor, reason, issued_at)
client_credit(id, client_id, amount_minor, source_payment_id, applied_to_invoice_id)

attachment(id, owner_id, bucket_path, mime, size)
audit(id, entity, entity_id, action, actor, at, before, after)
```

Key constraints:

- `unique (owner_id, series_kind, number)`
- `check (amount_minor >= 0)` on money columns; `qty_milli > 0`
- `unique (idempotency_key)` scoped per owner for payments and send requests
- Status transition checks via trigger and the RPC-only write path
- `time_entry`/`expense` rows with `status = 'invoiced'` cannot be updated (trigger)
- Foreign keys use `ON DELETE RESTRICT`

Totals on a **sent** invoice are stored (they are a snapshot). A nightly job recomputes them from lines and alerts on drift.

## 6. Data access and RPC surface

Angular uses `supabase-js`. Simple CRUD uses table access under RLS; anything with rules goes through an RPC function (`security invoker` by default, `security definer` only where a function must bypass RLS, with `owner_id` checked inside). Status columns and frozen fields are not writable through table access (column privileges revoked plus triggers).

### Owner (Supabase session, RLS by `auth.uid()`)

| Operation                   | Mechanism                                                                                | Notes                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Clients, projects, contacts | Table CRUD                                                                               | Archive via `archive_client(id)` RPC                                               |
| Time entries, expenses      | Table CRUD                                                                               | Mutations only while `draft` (trigger)                                             |
| Receipt upload              | Storage signed upload URL                                                                | Private bucket, size and MIME checked by bucket policy and a post-upload check     |
| Unbilled queue              | `unbilled_queue(client_id)` RPC                                                          | Grouped by project                                                                 |
| Write off                   | `write_off(type, id, reason)` RPC                                                        | Reason required                                                                    |
| Save draft                  | `save_invoice_draft(invoice, lines, expected_updated_at)` RPC                            | Raises `STALE_DRAFT` on mismatch                                                   |
| Send                        | `send_invoice(id, idempotency_key)` RPC                                                  | One transaction; see 4.2                                                           |
| Void                        | `void_invoice(id, reason)` RPC                                                           | Raises `VOID_NOT_ALLOWED` if money applied                                         |
| Duplicate                   | `duplicate_invoice(id)` RPC                                                              |                                                                                    |
| Credit note                 | `issue_credit_note(invoice_id, amount, reason, idempotency_key)` RPC                     |                                                                                    |
| Payments                    | `record_payment(...)`, `reverse_payment(id, reason, idempotency_key)` RPC                | Idempotency key required                                                           |
| Portal token                | `rotate_portal_token(client_id)` RPC                                                     | Returns the new link once                                                          |
| Reports                     | `report_dashboard()`, `report_aging()`, `report_revenue(range)`, `report_tax(range)` RPC | Views over the money trail                                                         |
| CSV export                  | Client-side from paginated RPC results, or an Edge Function for large sets               |                                                                                    |
| Settings                    | Table CRUD                                                                               | Profile, numbering, tax presets                                                    |
| PDF                         | `generate-pdf` Edge Function                                                             | Renders from the frozen snapshot, stores in a private bucket, returns a signed URL |
| Email                       | `send-invoice-email` Edge Function                                                       | Called after a successful send                                                     |

### Portal (anonymous role, token as argument)

| Operation | RPC                                             | Notes                                                            |
| --------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| List      | `portal_list_invoices(token)`                   | Sent, paid, void only                                            |
| Detail    | `portal_get_invoice(token, invoice_id)`         |                                                                  |
| PDF       | `portal_invoice_pdf(token, invoice_id)`         | Returns a short-lived signed URL to the same file the owner gets |
| Claim     | `portal_payment_claim(token, invoice_id, note)` | Creates a pending claim                                          |

The anonymous role has no table privileges at all; it can only execute the `portal_*` functions.

### Error codes (stable)

RPC functions raise exceptions with a stable code in `message` (and detail in `hint`/`detail`); an Angular interceptor-style wrapper maps them to typed errors:

`INVOICE_LOCKED`, `STALE_DRAFT`, `OVERPAYMENT`, `CURRENCY_MISMATCH`, `ROW_ALREADY_INVOICED`, `VOID_NOT_ALLOWED`, `TOKEN_INVALID` (rendered as a uniform not-found), `VALIDATION_FAILED`, `IDEMPOTENCY_CONFLICT`.

## 7. Security

- **Auth:** Supabase Auth. `owner_id` is always derived from `auth.uid()` inside RLS policies and RPC functions, never accepted from the client.
- **RLS:** enabled on every table, scoped by `owner_id`. Negative tests (pgTAP) prove owner A cannot read or write owner B's rows.
- **Portal:** the anonymous role has no table access. It can only call `portal_*` RPC functions, which take the token, resolve the client, and return only that client's data. These are the only `security definer` read paths, with a fixed `search_path`.
- **Portal tokens:** 128-bit random, stored as a hash (pgcrypto, with a pepper kept in Vault), constant-time comparison, rate limited in the database (attempt table keyed by IP/token prefix), rotatable, optionally expiring. Bad, expired, and revoked tokens return the same response.
- **Files:** private buckets; access through short-lived signed URLs. Size and MIME limited by bucket config and validated after upload.
- **Browser:** strict CSP, no inline scripts, escaped output. Only the project URL and anon key are in the Angular bundle.
- **Secrets:** the service role key and email key exist only in Edge Function secrets. The pepper lives in Vault. None appear in the browser.
- **Privacy:** data export and account deletion supported; avoid logging PII.

## 8. Angular architecture

```
apps/web/src/app/
├── core/        # auth, http, interceptors, guards, config
├── shared/      # ui components, pipes (Money), directives
├── features/
│   ├── clients/
│   ├── work/          # timer, time, expenses, unbilled
│   ├── invoices/      # list, builder, read-only view, dialogs
│   ├── reports/
│   ├── settings/
│   └── portal/        # separate lazy area, SSR
└── app.routes.ts
```

- **Standalone components**, signals for local state, `computed` for line and total math, RxJS only for streams (search debounce, polling, timer sync).
- **Lazy routes** per feature; the owner shell loads nothing until navigated.
- **Boundary rule (lint-enforced):** `features/portal` must not import from `features/invoices/builder` or any owner-only module.
- **Guards:** `authGuard`, `draftOnlyGuard`, `tokenGuard`, `unsavedChangesGuard`.
- **Resolvers:** client + unbilled queue for the builder; invoice for read-only view.
- **Data layer:** one `SupabaseService` wrapper in `core/`. It generates an idempotency key per user action for money RPCs, maps RPC error codes to typed errors, drives the loading indicator, and retries reads only, with backoff. (Angular HTTP interceptors do not see supabase-js calls, so these live in the wrapper; an `HttpClient` interceptor remains for any plain HTTP such as Edge Function calls.)
- **Forms:** typed forms with `FormArray` for lines; validators come from `packages/domain`; payload is the form value, not the DOM.
- **Pipes/functions:** one `Money` pipe, one `Tax` pure function for preview. Components never do currency math. The `send` RPC recomputes and rejects a draft whose stored totals disagree.
- **State:** feature-level signal stores; adopt NgRx SignalStore only if cross-feature state justifies it.
- **PDF:** generated by an Edge Function from the frozen snapshot; the web app only downloads or embeds it via a signed URL.

## 9. Quality: testing and budgets

| Level                  | Tooling                   | Targets                                                        |
| ---------------------- | ------------------------- | -------------------------------------------------------------- |
| Domain unit + property | Vitest, fast-check        | ≥ 95% coverage; sum-of-parts, rounding, exponents 0/2/3        |
| SQL/parity             | pgTAP + shared fixtures   | SQL totals equal TS totals to the minor unit                   |
| Database integration   | pgTAP on local Supabase   | Transactions, numbering, idempotency, RPC rules, RLS negatives |
| Component              | Angular testing utilities | Builder totals, validators, conflict banner                    |
| E2E                    | Playwright                | Capture → bill → send → pay; void; credit; token rotation      |
| Accessibility          | axe + manual              | WCAG 2.2 AA on key flows                                       |

**Budgets:** owner shell ≤ 200 KB gzipped JS, each lazy feature ≤ 100 KB; portal LCP ≤ 2.5 s on mid-range mobile over 4G; builder recalculation < 16 ms for 200 lines; list queries paginated (default 25, cursor).

**Definition of done (scenarios):**

1. Double-click Send creates one invoice and one number.
2. Two tabs editing one draft: the second save conflicts, nothing is lost.
3. Tax rate changes after send do not alter old PDFs.
4. Void with a payment is rejected; the credit note path works.
5. 60% then 40% payments move status to partially paid then paid, balance 0.
6. Overpayment creates client credit.
7. Rotating the token kills old links.
8. Token A cannot read client B's invoices.
9. Dashboard totals equal summed list balances.
10. Offline timer stop syncs later without duplicates.
11. 0- and 3-decimal currencies round and render correctly.
12. A project with billed time cannot be deleted.

## 10. Operations

- **Environments:** local (Supabase CLI), staging, production.
- **Migrations:** forward-only SQL in `supabase/migrations`, reviewed; no manual prod edits.
- **Backups:** daily database backup, restore tested before launch.
- **Observability:** Supabase logs, Edge Function logs with request IDs, error tracking in Angular and Edge Functions, uptime check on the portal, audit table queryable per document.
- **Jobs:** PDF generation and email run in Edge Functions, triggered after send (with a retry table for failures). The nightly total-drift check is a `pg_cron` job.
- **Feature flags** for v2 items (online payments, FX, recurring, reminders).

## 11. Conventions

- TypeScript strict; no `any` in domain code.
- Domain logic lives in `packages/domain` (preview) and in SQL functions (authoritative); both ship with tests first and share fixtures.
- Business rules never live only in Angular. Every rule has a database enforcement point.
- Conventional commits; small PRs; migrations and code changes in the same PR.
- Money in logs and APIs is always `{ amountMinor, currency }`.
- Dates: `date` columns for issue/due/payment dates (owner timezone); timestamps for events and audit.
- Naming: `snake_case` in the DB, `camelCase` in TS, `kebab-case` for files.
- UI states: every list and form defines empty, loading, error, and offline behaviour.

## 12. Glossary

- **Minor units:** the smallest currency unit (kobo, cents).
- **Frozen line:** an invoice line copied from time or expenses at send time.
- **Unbilled queue:** billable draft time and expenses not yet on an invoice.
- **Tax group:** lines sharing the same tax label and rate.
- **Snapshot:** values copied at issue time so later changes don't alter the document.
- **Idempotency key:** a client-generated key that makes a repeated request return the original result.
- **Client credit:** overpaid money held for a client to apply to a future invoice.
