import { describe, expect, it } from 'vitest';
import {
  DomainError,
  assertCanVoid,
  assertInvoiceTransition,
  assertPaymentTransition,
  assertWorkTransition,
  balanceMinor,
  canChangeClientCurrency,
  canTransitionInvoice,
  canTransitionPayment,
  canTransitionWork,
  canVoid,
  isInvoiceEditable,
  isIsoDate,
  isOverdue,
  isWorkEditable,
  splitPayment,
  statusFromBalance,
  validateInvoiceDraft,
  validatePayment,
  type InvoiceMoney,
} from '../src';

const inv = (over: Partial<InvoiceMoney> = {}): InvoiceMoney => ({
  status: 'sent',
  totalMinor: 1000,
  paidMinor: 0,
  creditedMinor: 0,
  ...over,
});

describe('status machines', () => {
  it('work items', () => {
    expect(canTransitionWork('draft', 'invoiced')).toBe(true);
    expect(canTransitionWork('draft', 'written_off')).toBe(true);
    expect(canTransitionWork('invoiced', 'draft')).toBe(true); // void releases rows
    expect(canTransitionWork('written_off', 'draft')).toBe(false);
    expect(() => assertWorkTransition('written_off', 'draft')).toThrow(DomainError);
    expect(() => assertWorkTransition('draft', 'invoiced')).not.toThrow();
    expect(isWorkEditable('draft')).toBe(true);
    expect(isWorkEditable('invoiced')).toBe(false);
  });
  it('invoices: sent is immutable and void is terminal', () => {
    expect(canTransitionInvoice('draft', 'sent')).toBe(true);
    expect(canTransitionInvoice('draft', 'paid')).toBe(false);
    expect(canTransitionInvoice('sent', 'void')).toBe(true);
    expect(canTransitionInvoice('paid', 'void')).toBe(false);
    expect(canTransitionInvoice('void', 'sent')).toBe(false);
    expect(canTransitionInvoice('paid', 'partially_paid')).toBe(true); // payment reversal
    expect(() => assertInvoiceTransition('draft', 'paid')).toThrow(DomainError);
    expect(() => assertInvoiceTransition('draft', 'sent')).not.toThrow();
    expect(isInvoiceEditable('draft')).toBe(true);
    expect(isInvoiceEditable('sent')).toBe(false);
  });
  it('payments: a reversal is final', () => {
    expect(canTransitionPayment('recorded', 'reversed')).toBe(true);
    expect(canTransitionPayment('reversed', 'recorded')).toBe(false);
    expect(() => assertPaymentTransition('reversed', 'recorded')).toThrow(DomainError);
    expect(() => assertPaymentTransition('recorded', 'reversed')).not.toThrow();
  });
});

describe('balance, void, derived status', () => {
  it('balance = total - payments - credits', () => {
    expect(balanceMinor(inv({ paidMinor: 300, creditedMinor: 200 }))).toBe(500);
  });
  it('void only when nothing applied; paid can never be voided', () => {
    expect(canVoid(inv())).toBe(true);
    expect(canVoid(inv({ paidMinor: 1 }))).toBe(false);
    expect(canVoid(inv({ creditedMinor: 1 }))).toBe(false);
    expect(canVoid(inv({ status: 'paid', paidMinor: 1000 }))).toBe(false);
    expect(canVoid(inv({ status: 'draft' }))).toBe(false);
    expect(() => assertCanVoid(inv({ paidMinor: 1 }))).toThrow(DomainError);
    expect(() => assertCanVoid(inv())).not.toThrow();
  });
  it('60% then 40% moves sent -> partially_paid -> paid (scenario 5)', () => {
    expect(statusFromBalance(inv({ paidMinor: 600 }))).toBe('partially_paid');
    expect(statusFromBalance(inv({ paidMinor: 1000 }))).toBe('paid');
    expect(statusFromBalance(inv({ paidMinor: 600, creditedMinor: 400 }))).toBe('paid');
    expect(statusFromBalance(inv({ status: 'paid', paidMinor: 0 }))).toBe('sent'); // reversed
    expect(statusFromBalance(inv({ status: 'draft' }))).toBe('draft');
    expect(statusFromBalance(inv({ status: 'void' }))).toBe('void');
  });
  it('overdue is derived from due date and balance', () => {
    const base = { ...inv(), dueDate: '2026-10-01' };
    expect(isOverdue(base, '2026-10-02')).toBe(true);
    expect(isOverdue(base, '2026-10-01')).toBe(false); // flips after the due date
    expect(isOverdue({ ...base, status: 'partially_paid', paidMinor: 10 }, '2026-10-02')).toBe(
      true,
    );
    expect(isOverdue({ ...base, status: 'paid', paidMinor: 1000 }, '2026-10-02')).toBe(false);
    expect(isOverdue({ ...base, status: 'draft' }, '2026-10-02')).toBe(false);
  });
});

describe('validators', () => {
  const ok = {
    currency: 'NGN',
    clientCurrency: 'NGN',
    issueDate: '2026-10-01',
    dueDate: '2026-10-15',
    lines: [{ qtyMilli: 1000, unitPriceMinor: 100 }],
  };
  it('accepts a valid draft', () => {
    expect(validateInvoiceDraft(ok)).toEqual([]);
  });
  it('reports every violated invariant', () => {
    const codes = validateInvoiceDraft({
      currency: 'USD',
      clientCurrency: 'NGN',
      issueDate: '2026-10-10',
      dueDate: '2026-10-01',
      lines: [],
    }).map((i) => i.code);
    expect(codes).toEqual(['NO_LINES', 'DUE_BEFORE_ISSUE', 'CURRENCY_MISMATCH']);
  });
  it('flags bad lines, dates and currency codes', () => {
    const issues = validateInvoiceDraft({
      ...ok,
      currency: 'xx',
      issueDate: '2026-13-01',
      dueDate: 'nope',
      lines: [{ qtyMilli: 0, unitPriceMinor: -1 }],
    });
    expect(issues.map((i) => i.code).sort()).toEqual(
      [
        'INVALID_CURRENCY',
        'INVALID_DATE',
        'INVALID_DATE',
        'NEGATIVE_AMOUNT',
        'QTY_NOT_POSITIVE',
      ].sort(),
    );
  });
  it('validates ISO dates strictly', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
  });
  it('locks client currency after the first sent invoice', () => {
    expect(canChangeClientCurrency(0)).toBe(true);
    expect(canChangeClientCurrency(1)).toBe(false);
  });
  it('validates payments', () => {
    const p = {
      amountMinor: 500,
      date: '2026-10-02',
      invoiceIssueDate: '2026-10-01',
      balanceMinor: 1000,
    };
    expect(validatePayment(p)).toEqual([]);
    expect(validatePayment({ ...p, amountMinor: 0 })[0]?.code).toBe('PAYMENT_NOT_POSITIVE');
    expect(validatePayment({ ...p, amountMinor: 1001 })[0]?.code).toBe('OVERPAYMENT');
    expect(validatePayment({ ...p, amountMinor: 1001, allowOverpayment: true })).toEqual([]);
    expect(validatePayment({ ...p, date: '2026-09-30' })[0]?.code).toBe('PAYMENT_BEFORE_ISSUE');
    expect(validatePayment({ ...p, date: 'x' })[0]?.code).toBe('INVALID_DATE');
  });
  it('overpayment becomes client credit (scenario 6)', () => {
    expect(splitPayment(1100, 1000)).toEqual({ appliedMinor: 1000, creditMinor: 100 });
    expect(splitPayment(400, 1000)).toEqual({ appliedMinor: 400, creditMinor: 0 });
    expect(splitPayment(50, 0)).toEqual({ appliedMinor: 0, creditMinor: 50 });
  });
});
