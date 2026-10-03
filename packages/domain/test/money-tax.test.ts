import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DomainError,
  add,
  allocateLargestRemainder,
  compare,
  computeInvoiceTotals,
  currencyExponent,
  divRoundHalfAwayFromZero,
  exclusiveTax,
  formatMoney,
  inclusiveSplit,
  isCurrencyCode,
  isZero,
  lineNet,
  money,
  negate,
  parseMajor,
  percentOf,
  subtract,
  sum,
  toMajorString,
  toSafeInteger,
  zero,
} from '../src';

describe('rounding', () => {
  it('rounds half away from zero in both directions', () => {
    expect(divRoundHalfAwayFromZero(5n, 2n)).toBe(3n);
    expect(divRoundHalfAwayFromZero(-5n, 2n)).toBe(-3n);
    expect(divRoundHalfAwayFromZero(5n, -2n)).toBe(-3n);
    expect(divRoundHalfAwayFromZero(4n, 3n)).toBe(1n);
    expect(divRoundHalfAwayFromZero(-4n, 3n)).toBe(-1n);
    expect(divRoundHalfAwayFromZero(0n, 7n)).toBe(0n);
  });
  it('rejects division by zero and unsafe integers', () => {
    expect(() => divRoundHalfAwayFromZero(1n, 0n)).toThrow(DomainError);
    expect(() => toSafeInteger(2n ** 60n)).toThrow(DomainError);
    expect(() => toSafeInteger(-(2n ** 60n))).toThrow(DomainError);
  });
});

describe('currency', () => {
  it('knows 0, 2 and 3 decimal currencies', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('NGN')).toBe(2);
    expect(currencyExponent('KWD')).toBe(3);
  });
  it('validates codes', () => {
    expect(isCurrencyCode('USD')).toBe(true);
    expect(isCurrencyCode('usd')).toBe(false);
    expect(() => currencyExponent('US')).toThrow(DomainError);
  });
});

describe('Money', () => {
  it('does integer arithmetic within one currency', () => {
    const a = money(1050, 'USD');
    const b = money(250, 'USD');
    expect(add(a, b).amountMinor).toBe(1300);
    expect(subtract(a, b).amountMinor).toBe(800);
    expect(negate(a).amountMinor).toBe(-1050);
    expect(sum([a, b, b], 'USD').amountMinor).toBe(1550);
    expect(sum([], 'USD')).toEqual(zero('USD'));
    expect(compare(a, b)).toBe(1);
    expect(compare(b, a)).toBe(-1);
    expect(compare(a, a)).toBe(0);
    expect(isZero(zero('USD'))).toBe(true);
  });
  it('refuses floats and mixed currencies', () => {
    expect(() => money(10.5, 'USD')).toThrow(DomainError);
    expect(() => add(money(1, 'USD'), money(1, 'NGN'))).toThrow(DomainError);
    expect(() => subtract(money(1, 'USD'), money(1, 'NGN'))).toThrow(DomainError);
    expect(() => compare(money(1, 'USD'), money(1, 'NGN'))).toThrow(DomainError);
  });
  it('converts to exact major strings for 0/2/3 decimal currencies', () => {
    expect(toMajorString(money(123456, 'KWD'))).toBe('123.456');
    expect(toMajorString(money(5, 'USD'))).toBe('0.05');
    expect(toMajorString(money(-5, 'USD'))).toBe('-0.05');
    expect(toMajorString(money(1200, 'JPY'))).toBe('1200');
  });
  it('parses major strings without floats', () => {
    expect(parseMajor('12.34', 'USD').amountMinor).toBe(1234);
    expect(parseMajor('12', 'USD').amountMinor).toBe(1200);
    expect(parseMajor('12.5', 'USD').amountMinor).toBe(1250);
    expect(parseMajor('-0.07', 'USD').amountMinor).toBe(-7);
    expect(parseMajor('1.234', 'KWD').amountMinor).toBe(1234);
    expect(parseMajor('1200', 'JPY').amountMinor).toBe(1200);
    expect(() => parseMajor('1.234', 'USD')).toThrow(DomainError);
    expect(() => parseMajor('12.5', 'JPY')).toThrow(DomainError);
    expect(() => parseMajor('abc', 'USD')).toThrow(DomainError);
  });
  it('formats with the right number of decimals', () => {
    expect(formatMoney(money(123456, 'KWD'), 'en-US')).toContain('123.456');
    expect(formatMoney(money(1200, 'JPY'), 'en-US')).toContain('1,200');
    expect(formatMoney(money(1234, 'USD'), 'en-US')).toBe('$12.34');
  });
  it('round-trips parse and toMajorString', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        fc.constantFrom('JPY', 'USD', 'NGN', 'KWD'),
        (minor, currency) => {
          const m = money(minor, currency);
          expect(parseMajor(toMajorString(m), currency)).toEqual(m);
        },
      ),
    );
  });
});

describe('allocateLargestRemainder', () => {
  it('splits exactly and deterministically', () => {
    expect(allocateLargestRemainder(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateLargestRemainder(0, [5, 5])).toEqual([0, 0]);
    expect(allocateLargestRemainder(10, [0, 10])).toEqual([0, 10]);
  });
  it('handles empty and all-zero weights', () => {
    expect(allocateLargestRemainder(0, [])).toEqual([]);
    expect(allocateLargestRemainder(0, [0, 0])).toEqual([0, 0]);
    expect(() => allocateLargestRemainder(5, [])).toThrow(DomainError);
    expect(() => allocateLargestRemainder(5, [0, 0])).toThrow(DomainError);
  });
  it('rejects bad input', () => {
    expect(() => allocateLargestRemainder(-1, [1])).toThrow(DomainError);
    expect(() => allocateLargestRemainder(1, [-1, 2])).toThrow(DomainError);
    expect(() => allocateLargestRemainder(1.5, [1])).toThrow(DomainError);
  });
  it('property: parts always sum to the total and never exceed ceil share', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.array(fc.integer({ min: 0, max: 1_000_000_000 }), { minLength: 1, maxLength: 30 }),
        (total, weights) => {
          fc.pre(weights.some((w) => w > 0));
          const parts = allocateLargestRemainder(total, weights);
          expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
          const weightSum = weights.reduce((a, b) => a + b, 0);
          parts.forEach((p, i) => {
            const exact = (BigInt(total) * BigInt(weights[i] ?? 0)) / BigInt(weightSum);
            expect(BigInt(p) === exact || BigInt(p) === exact + 1n).toBe(true);
          });
        },
      ),
    );
  });
});

describe('line net, tax, inclusive split', () => {
  it('computes line net with half-away rounding', () => {
    expect(lineNet(1500, 333)).toBe(500); // 499.5 -> 500
    expect(lineNet(1000, 10000)).toBe(10000);
    expect(lineNet(1, 1)).toBe(0);
  });
  it('validates line input', () => {
    expect(() => lineNet(0, 100)).toThrow(DomainError);
    expect(() => lineNet(1000, -1)).toThrow(DomainError);
    expect(() => lineNet(1.5, 100)).toThrow(DomainError);
  });
  it('computes tax on net and percentOf', () => {
    expect(exclusiveTax(551475, 750)).toBe(41361);
    expect(percentOf(600500, 500)).toBe(30025);
    expect(percentOf(-5, 5000)).toBe(-3);
  });
  it('inclusive: net + tax always equals gross', () => {
    expect(inclusiveSplit(10750, 750)).toEqual({ netMinor: 10000, taxMinor: 750 });
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 5000 }),
        (gross, rate) => {
          const { netMinor, taxMinor } = inclusiveSplit(gross, rate);
          expect(netMinor + taxMinor).toBe(gross);
          expect(taxMinor).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});

describe('computeInvoiceTotals', () => {
  const vat = { taxLabel: 'VAT', taxRateBp: 750 };

  it('rejects invalid discounts', () => {
    const lines = [{ qtyMilli: 1000, unitPriceMinor: 1000, ...vat }];
    expect(() =>
      computeInvoiceTotals(lines, { type: 'percent', valueBp: 10001 }, 'exclusive'),
    ).toThrow(DomainError);
    expect(() =>
      computeInvoiceTotals(lines, { type: 'percent', valueBp: -1 }, 'exclusive'),
    ).toThrow(DomainError);
    expect(() =>
      computeInvoiceTotals(lines, { type: 'fixed', valueMinor: 1001 }, 'exclusive'),
    ).toThrow(DomainError);
    expect(() =>
      computeInvoiceTotals(lines, { type: 'fixed', valueMinor: -1 }, 'exclusive'),
    ).toThrow(DomainError);
  });
  it('rejects negative tax rates and an empty invoice with a discount', () => {
    expect(() =>
      computeInvoiceTotals(
        [{ qtyMilli: 1000, unitPriceMinor: 1, taxLabel: 'X', taxRateBp: -1 }],
        { type: 'none' },
        'exclusive',
      ),
    ).toThrow(DomainError);
    expect(computeInvoiceTotals([], { type: 'none' }, 'exclusive').totalMinor).toBe(0);
  });

  const lineArb = fc.record({
    qtyMilli: fc.integer({ min: 1, max: 1_000_000 }),
    unitPriceMinor: fc.integer({ min: 0, max: 100_000_000 }),
    taxLabel: fc.constantFrom('VAT', 'Exempt', 'Zero'),
    taxRateBp: fc.constantFrom(0, 500, 750, 1500),
  });
  const discountArb = fc.oneof(
    fc.constant({ type: 'none' as const }),
    fc.record({
      type: fc.constant('percent' as const),
      valueBp: fc.integer({ min: 0, max: 10000 }),
    }),
  );

  it('property: parts sum to total, allocations sum to discount, no drift', () => {
    fc.assert(
      fc.property(
        fc.array(lineArb, { minLength: 1, maxLength: 40 }),
        discountArb,
        fc.constantFrom<'exclusive' | 'inclusive'>('exclusive', 'inclusive'),
        (lines, discount, mode) => {
          const r = computeInvoiceTotals(lines, discount, mode);
          expect(r.lines.reduce((a, l) => a + l.lineNetMinor, 0)).toBe(r.subtotalMinor);
          expect(r.lines.reduce((a, l) => a + l.discountAllocMinor, 0)).toBe(r.discountMinor);
          expect(r.taxGroups.reduce((a, g) => a + g.taxMinor, 0)).toBe(r.taxMinor);
          const afterDiscount = r.subtotalMinor - r.discountMinor;
          const expectedTotal = mode === 'exclusive' ? afterDiscount + r.taxMinor : afterDiscount;
          expect(r.totalMinor).toBe(expectedTotal);
          // group nets plus group taxes reconstruct the total in both modes
          const netPlusTax = r.taxGroups.reduce((a, g) => a + g.netMinor + g.taxMinor, 0);
          expect(netPlusTax).toBe(r.totalMinor);
          // deterministic: same input, same output
          expect(computeInvoiceTotals(lines, discount, mode)).toEqual(r);
        },
      ),
    );
  });

  it('property: line order does not change totals', () => {
    fc.assert(
      fc.property(fc.array(lineArb, { minLength: 1, maxLength: 20 }), (lines) => {
        const a = computeInvoiceTotals(lines, { type: 'none' }, 'exclusive');
        const b = computeInvoiceTotals([...lines].reverse(), { type: 'none' }, 'exclusive');
        expect(b.totalMinor).toBe(a.totalMinor);
        expect(b.taxGroups).toEqual(a.taxGroups);
      }),
    );
  });
});
