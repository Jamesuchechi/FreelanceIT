import { DomainError } from './errors';

export type WorkStatus = 'draft' | 'invoiced' | 'written_off';
export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void';
export type PaymentStatus = 'recorded' | 'reversed';

type Transitions<S extends string> = Readonly<Record<S, readonly S[]>>;

/** Time entries and expenses. `invoiced -> draft` happens when the invoice is voided. */
export const workTransitions: Transitions<WorkStatus> = {
  draft: ['invoiced', 'written_off'],
  invoiced: ['draft'],
  written_off: [],
};

/**
 * Invoices. Payment reversals can move an invoice back down
 * (`paid -> partially_paid -> sent`). `void` and `paid`-with-money rules live in `canVoid`.
 */
export const invoiceTransitions: Transitions<InvoiceStatus> = {
  draft: ['sent'],
  sent: ['partially_paid', 'paid', 'void'],
  partially_paid: ['paid', 'sent'],
  paid: ['partially_paid', 'sent'],
  void: [],
};

/** A reversal is a new row; the original just flips to `reversed`. */
export const paymentTransitions: Transitions<PaymentStatus> = {
  recorded: ['reversed'],
  reversed: [],
};

function canMove<S extends string>(table: Transitions<S>, from: S, to: S): boolean {
  return table[from].includes(to);
}

function assertMove<S extends string>(table: Transitions<S>, kind: string, from: S, to: S): void {
  if (!canMove(table, from, to)) {
    throw new DomainError('INVALID_TRANSITION', `${kind}: ${from} -> ${to} is not allowed`);
  }
}

export const canTransitionWork = (from: WorkStatus, to: WorkStatus) =>
  canMove(workTransitions, from, to);
export const canTransitionInvoice = (from: InvoiceStatus, to: InvoiceStatus) =>
  canMove(invoiceTransitions, from, to);
export const canTransitionPayment = (from: PaymentStatus, to: PaymentStatus) =>
  canMove(paymentTransitions, from, to);

export const assertWorkTransition = (from: WorkStatus, to: WorkStatus) =>
  assertMove(workTransitions, 'Work item', from, to);
export const assertInvoiceTransition = (from: InvoiceStatus, to: InvoiceStatus) =>
  assertMove(invoiceTransitions, 'Invoice', from, to);
export const assertPaymentTransition = (from: PaymentStatus, to: PaymentStatus) =>
  assertMove(paymentTransitions, 'Payment', from, to);

/** Sent invoices are immutable; only drafts may be edited. */
export const isInvoiceEditable = (status: InvoiceStatus): boolean => status === 'draft';

/** Time entries and expenses are editable only while draft. */
export const isWorkEditable = (status: WorkStatus): boolean => status === 'draft';

export interface InvoiceMoney {
  readonly status: InvoiceStatus;
  readonly totalMinor: number;
  /** Net of reversals. */
  readonly paidMinor: number;
  readonly creditedMinor: number;
}

/** Balance = total - payments (net of reversals) - credit notes. Computed, never stored as editable. */
export function balanceMinor(
  inv: Pick<InvoiceMoney, 'totalMinor' | 'paidMinor' | 'creditedMinor'>,
): number {
  return inv.totalMinor - inv.paidMinor - inv.creditedMinor;
}

/** Void only when a sent invoice has nothing paid or credited. A paid invoice can never be voided. */
export function canVoid(inv: InvoiceMoney): boolean {
  return inv.status === 'sent' && inv.paidMinor === 0 && inv.creditedMinor === 0;
}

export function assertCanVoid(inv: InvoiceMoney): void {
  if (!canVoid(inv)) {
    throw new DomainError(
      'VOID_NOT_ALLOWED',
      'Only a sent invoice with no payments or credit notes can be voided; issue a credit note instead',
    );
  }
}

/** Status after the money trail changes on a sent invoice. */
export function statusFromBalance(inv: InvoiceMoney): InvoiceStatus {
  if (inv.status === 'draft' || inv.status === 'void') return inv.status;
  const balance = balanceMinor(inv);
  if (balance <= 0) return 'paid';
  return inv.paidMinor > 0 || inv.creditedMinor > 0 ? 'partially_paid' : 'sent';
}

/** Overdue is derived, never stored. Dates are ISO `YYYY-MM-DD` (owner timezone); it flips after the due date. */
export function isOverdue(
  inv: InvoiceMoney & { readonly dueDate: string },
  today: string,
): boolean {
  return (
    (inv.status === 'sent' || inv.status === 'partially_paid') &&
    inv.dueDate < today &&
    balanceMinor(inv) > 0
  );
}
