import { DomainError } from './errors.js';
import { assertInteger, divRoundHalfAwayFromZero, toSafeInteger } from './rounding.js';


/**
 * Splits `total` across `weights` so the pieces sum exactly to `total`.
 * Largest-remainder method; ties go to the lowest index (deterministic).
 * Weights must be non-negative; if they all sum to zero, `total` must be zero.
 */
export function allocateLargestRemainder(total: number, weights: readonly number[]): number[] {
  assertInteger(total, 'total');
  weights.forEach((w, i) => {
    assertInteger(w, `weights[${i}]`);
    if (w < 0) throw new DomainError('VALIDATION_FAILED', 'Weights must be non-negative');
  });
  if (total < 0) throw new DomainError('VALIDATION_FAILED', 'Total to allocate must be >= 0');

  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0 || weightSum === 0) {
    if (total !== 0) {
      throw new DomainError('VALIDATION_FAILED', 'Nothing to allocate the amount across');
    }
    return weights.map(() => 0);
  }

  const bigTotal = BigInt(total);
  const bigSum = BigInt(weightSum);
  const floors: number[] = [];
  const remainders: bigint[] = [];
  let allocated = 0;
  for (const w of weights) {
    const product = bigTotal * BigInt(w);
    const floor = product / bigSum;
    floors.push(toSafeInteger(floor));
    remainders.push(product % bigSum);
    allocated += toSafeInteger(floor);
  }

  let leftover = total - allocated;
  const order = remainders
    .map((remainder, index) => ({ remainder, index }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );
  for (const { index } of order) {
    if (leftover === 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    leftover -= 1;
  }
  return floors;
}

/** percentBp is in basis points (5% = 500). Rounded half away from zero. */
export function percentOf(amountMinor: number, percentBp: number): number {
  assertInteger(amountMinor, 'amountMinor');
  assertInteger(percentBp, 'percentBp');
  return toSafeInteger(divRoundHalfAwayFromZero(BigInt(amountMinor) * BigInt(percentBp), 10000n));
}
