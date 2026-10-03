import { currencyExponent, type CurrencyCode } from './currency';
import { DomainError } from './errors';
import { assertInteger } from './rounding';

/** Money is always integer minor units plus an ISO 4217 currency. Never a float. */
export interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  assertInteger(amountMinor, 'amountMinor');
  currencyExponent(currency); // validates the code
  return { amountMinor, currency };
}

export function zero(currency: CurrencyCode): Money {
  return money(0, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new DomainError('CURRENCY_MISMATCH', `Cannot combine ${a.currency} and ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.amountMinor, a.currency);
}

export function sum(values: readonly Money[], currency: CurrencyCode): Money {
  return values.reduce((acc, v) => add(acc, v), zero(currency));
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor === b.amountMinor) return 0;
  return a.amountMinor < b.amountMinor ? -1 : 1;
}

export function isZero(a: Money): boolean {
  return a.amountMinor === 0;
}

/** Exact decimal string in major units, e.g. 123456 KWD(3) -> "123.456". */
export function toMajorString(m: Money): string {
  const exponent = currencyExponent(m.currency);
  const negative = m.amountMinor < 0;
  const digits = Math.abs(m.amountMinor)
    .toString()
    .padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return `${negative ? '-' : ''}${whole}${exponent > 0 ? `.${fraction}` : ''}`;
}

/** Parses a plain decimal string ("1234.5", "-12") into Money without touching floats. */
export function parseMajor(input: string, currency: CurrencyCode): Money {
  const exponent = currencyExponent(currency);
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!match) {
    throw new DomainError('VALIDATION_FAILED', `Invalid amount: ${input}`);
  }
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > exponent) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `${currency} allows at most ${exponent} decimal places`,
    );
  }
  const minor = Number(`${whole ?? '0'}${fraction.padEnd(exponent, '0')}`);
  return money(sign ? -minor : minor, currency);
}

/** Locale-aware display. Uses the exact decimal string, so no float rounding. */
export function formatMoney(m: Money, locale: string): string {
  const exponent = currencyExponent(m.currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(toMajorString(m) as `${number}`);
}
