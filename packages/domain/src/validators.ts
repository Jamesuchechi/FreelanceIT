import { currencyExponent } from './currency.js';


export type ValidationCode =
  | 'NO_LINES'
  | 'QTY_NOT_POSITIVE'
  | 'NEGATIVE_AMOUNT'
  | 'INVALID_DATE'
  | 'DUE_BEFORE_ISSUE'
  | 'CURRENCY_MISMATCH'
  | 'INVALID_CURRENCY'
  | 'PAYMENT_NOT_POSITIVE'
  | 'PAYMENT_BEFORE_ISSUE'
  | 'OVERPAYMENT';

export interface ValidationIssue {
  readonly code: ValidationCode;
  /** Field path, e.g. `lines.2.qtyMilli`. */
  readonly path: string;
}

/** Strict ISO calendar date `YYYY-MM-DD`. */
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export interface DraftValidationInput {
  readonly currency: string;
  readonly clientCurrency: string;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly lines: readonly { readonly qtyMilli: number; readonly unitPriceMinor: number }[];
}

/** Checks the invariants required before send. Returns every issue, not just the first. */
export function validateInvoiceDraft(input: DraftValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (code: ValidationCode, path: string) => issues.push({ code, path });

  if (input.lines.length === 0) add('NO_LINES', 'lines');
  input.lines.forEach((line, i) => {
    if (!Number.isSafeInteger(line.qtyMilli) || line.qtyMilli <= 0) {
      add('QTY_NOT_POSITIVE', `lines.${i}.qtyMilli`);
    }
    if (!Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) {
      add('NEGATIVE_AMOUNT', `lines.${i}.unitPriceMinor`);
    }
  });

  const issueOk = isIsoDate(input.issueDate);
  const dueOk = isIsoDate(input.dueDate);
  if (!issueOk) add('INVALID_DATE', 'issueDate');
  if (!dueOk) add('INVALID_DATE', 'dueDate');
  if (issueOk && dueOk && input.dueDate < input.issueDate) add('DUE_BEFORE_ISSUE', 'dueDate');

  let currencyKnown = true;
  try {
    currencyExponent(input.currency);
  } catch {
    currencyKnown = false;
    add('INVALID_CURRENCY', 'currency');
  }
  if (currencyKnown && input.currency !== input.clientCurrency)
    add('CURRENCY_MISMATCH', 'currency');
  return issues;
}

/** A client's currency is locked once it has any sent invoice. */
export function canChangeClientCurrency(sentInvoiceCount: number): boolean {
  return sentInvoiceCount === 0;
}

export interface PaymentValidationInput {
  readonly amountMinor: number;
  readonly date: string;
  readonly invoiceIssueDate: string;
  readonly balanceMinor: number;
  /** Explicit owner choice; the excess becomes client credit. */
  readonly allowOverpayment?: boolean;
}

export function validatePayment(input: PaymentValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    issues.push({ code: 'PAYMENT_NOT_POSITIVE', path: 'amountMinor' });
  } else if (input.amountMinor > input.balanceMinor && !input.allowOverpayment) {
    issues.push({ code: 'OVERPAYMENT', path: 'amountMinor' });
  }
  if (!isIsoDate(input.date)) {
    issues.push({ code: 'INVALID_DATE', path: 'date' });
  } else if (isIsoDate(input.invoiceIssueDate) && input.date < input.invoiceIssueDate) {
    issues.push({ code: 'PAYMENT_BEFORE_ISSUE', path: 'date' });
  }
  return issues;
}

/** Splits an accepted payment into the part applied to the invoice and any client credit. */
export function splitPayment(
  amountMinor: number,
  balanceMinor: number,
): { appliedMinor: number; creditMinor: number } {
  const appliedMinor = Math.max(0, Math.min(amountMinor, balanceMinor));
  return { appliedMinor, creditMinor: amountMinor - appliedMinor };
}
