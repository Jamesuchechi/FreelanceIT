import { DomainError } from './errors.js';


/**
 * Integer division rounded half away from zero. `d` must be non-zero.
 * Pure bigint math, so no float drift and no overflow for realistic ledgers.
 */
export function divRoundHalfAwayFromZero(n: bigint, d: bigint): bigint {
  if (d === 0n) {
    throw new DomainError('VALIDATION_FAILED', 'Division by zero');
  }
  const negative = n < 0n !== d < 0n;
  const absN = n < 0n ? -n : n;
  const absD = d < 0n ? -d : d;
  const quotient = absN / absD;
  const remainder = absN % absD;
  const rounded = remainder * 2n >= absD ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** Converts a bigint to a safe integer number or throws. */
export function toSafeInteger(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new DomainError('VALIDATION_FAILED', 'Amount exceeds the safe integer range');
  }
  return Number(value);
}

/** Asserts a value is an integer number (no floats on money). */
export function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new DomainError('VALIDATION_FAILED', `${label} must be a safe integer`);
  }
}
