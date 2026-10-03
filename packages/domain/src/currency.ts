import { DomainError } from './errors.js';


/** ISO 4217 currencies with 0 minor-unit digits. */
const ZERO_DECIMAL = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'UYI',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

/** ISO 4217 currencies with 3 minor-unit digits. */
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

export type CurrencyCode = string;

export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

/** Number of minor-unit digits (0, 2, or 3) for a currency. */
export function currencyExponent(currency: CurrencyCode): 0 | 2 | 3 {
  if (!isCurrencyCode(currency)) {
    throw new DomainError('VALIDATION_FAILED', `Invalid currency code: ${currency}`);
  }
  if (ZERO_DECIMAL.has(currency)) return 0;
  if (THREE_DECIMAL.has(currency)) return 3;
  return 2;
}
