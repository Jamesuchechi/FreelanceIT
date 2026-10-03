import { allocateLargestRemainder, percentOf } from './allocation.js';
import { DomainError } from './errors.js';
import { assertInteger, divRoundHalfAwayFromZero, toSafeInteger } from './rounding.js';


export type TaxMode = 'exclusive' | 'inclusive';

export type Discount =
  | { readonly type: 'none' }
  | { readonly type: 'percent'; readonly valueBp: number }
  | { readonly type: 'fixed'; readonly valueMinor: number };

export interface LineInput {
  /** Quantity in integer thousandths (1.5 h = 1500). Must be > 0. */
  readonly qtyMilli: number;
  /** Unit price in minor units. Must be >= 0. In inclusive mode this is a gross price. */
  readonly unitPriceMinor: number;
  readonly taxLabel: string;
  /** Tax rate in basis points (7.5% = 750). */
  readonly taxRateBp: number;
}

export interface LineResult {
  /** round_half_away_from_zero(qty_milli * unit_price / 1000) */
  readonly lineNetMinor: number;
  /** This line's share of the document discount. */
  readonly discountAllocMinor: number;
}

export interface TaxGroup {
  readonly taxLabel: string;
  readonly taxRateBp: number;
  /** Net amount of the group after discount. */
  readonly netMinor: number;
  readonly taxMinor: number;
}

export interface InvoiceTotals {
  readonly lines: readonly LineResult[];
  /** Sum of line amounts (gross in inclusive mode). */
  readonly subtotalMinor: number;
  readonly discountMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly taxGroups: readonly TaxGroup[];
}

/** Line total: qty_milli * unit_price / 1000, rounded half away from zero. */
export function lineNet(qtyMilli: number, unitPriceMinor: number): number {
  assertInteger(qtyMilli, 'qtyMilli');
  assertInteger(unitPriceMinor, 'unitPriceMinor');
  if (qtyMilli <= 0) throw new DomainError('VALIDATION_FAILED', 'Quantity must be greater than 0');
  if (unitPriceMinor < 0)
    throw new DomainError('VALIDATION_FAILED', 'Unit price cannot be negative');
  return toSafeInteger(divRoundHalfAwayFromZero(BigInt(qtyMilli) * BigInt(unitPriceMinor), 1000n));
}

/** Tax on a net amount (exclusive mode): round(net * rate / 10000). */
export function exclusiveTax(netMinor: number, rateBp: number): number {
  return percentOf(netMinor, rateBp);
}

/** Splits a gross amount (inclusive mode). net + tax always equals gross. */
export function inclusiveSplit(
  grossMinor: number,
  rateBp: number,
): { netMinor: number; taxMinor: number } {
  assertInteger(grossMinor, 'grossMinor');
  assertInteger(rateBp, 'rateBp');
  const net = toSafeInteger(
    divRoundHalfAwayFromZero(BigInt(grossMinor) * 10000n, BigInt(10000 + rateBp)),
  );
  return { netMinor: net, taxMinor: grossMinor - net };
}

export function discountAmount(subtotalMinor: number, discount: Discount): number {
  switch (discount.type) {
    case 'none':
      return 0;
    case 'percent': {
      assertInteger(discount.valueBp, 'discount percent');
      if (discount.valueBp < 0 || discount.valueBp > 10000) {
        throw new DomainError('VALIDATION_FAILED', 'Discount percent must be between 0 and 100');
      }
      return percentOf(subtotalMinor, discount.valueBp);
    }
    case 'fixed': {
      assertInteger(discount.valueMinor, 'discount amount');
      if (discount.valueMinor < 0 || discount.valueMinor > subtotalMinor) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'Fixed discount must be between 0 and the subtotal',
        );
      }
      return discount.valueMinor;
    }
  }
}

/**
 * Full invoice calculation.
 * 1. line_net per line (rounded once per line)
 * 2. document discount, allocated pro-rata by line net (largest remainder, sums exactly)
 * 3. group by (tax label, rate); tax rounded once per group
 * 4. total = subtotal - discount (+ tax in exclusive mode)
 */
export function computeInvoiceTotals(
  lines: readonly LineInput[],
  discount: Discount,
  taxMode: TaxMode,
): InvoiceTotals {
  const nets = lines.map((l) => {
    assertInteger(l.taxRateBp, 'taxRateBp');
    if (l.taxRateBp < 0) throw new DomainError('VALIDATION_FAILED', 'Tax rate cannot be negative');
    return lineNet(l.qtyMilli, l.unitPriceMinor);
  });
  const subtotalMinor = nets.reduce((a, b) => a + b, 0);
  const discountMinor = discountAmount(subtotalMinor, discount);
  const allocations = allocateLargestRemainder(discountMinor, nets);

  const groups = new Map<string, { taxLabel: string; taxRateBp: number; baseMinor: number }>();
  lines.forEach((line, i) => {
    const key = `${line.taxLabel}\u0000${line.taxRateBp}`;
    const base = (nets[i] ?? 0) - (allocations[i] ?? 0);
    const existing = groups.get(key);
    if (existing) existing.baseMinor += base;
    else groups.set(key, { taxLabel: line.taxLabel, taxRateBp: line.taxRateBp, baseMinor: base });
  });

  const taxGroups: TaxGroup[] = [...groups.values()]
    .sort((a, b) => a.taxLabel.localeCompare(b.taxLabel) || a.taxRateBp - b.taxRateBp)
    .map(({ taxLabel, taxRateBp, baseMinor }) => {
      if (taxMode === 'exclusive') {
        return {
          taxLabel,
          taxRateBp,
          netMinor: baseMinor,
          taxMinor: exclusiveTax(baseMinor, taxRateBp),
        };
      }
      const { netMinor, taxMinor } = inclusiveSplit(baseMinor, taxRateBp);
      return { taxLabel, taxRateBp, netMinor, taxMinor };
    });

  const taxMinor = taxGroups.reduce((a, g) => a + g.taxMinor, 0);
  const afterDiscount = subtotalMinor - discountMinor;
  return {
    lines: nets.map((lineNetMinor, i) => ({
      lineNetMinor,
      discountAllocMinor: allocations[i] ?? 0,
    })),
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor: taxMode === 'exclusive' ? afterDiscount + taxMinor : afterDiscount,
    taxGroups,
  };
}
