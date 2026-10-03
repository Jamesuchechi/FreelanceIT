import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  computeInvoiceTotals,
  type Discount,
  type LineInput,
  type TaxGroup,
  type TaxMode,
} from '../src';

interface Fixture {
  name: string;
  taxMode: TaxMode;
  discount: Discount;
  lines: LineInput[];
  expected: {
    subtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    totalMinor: number;
    taxGroups: TaxGroup[];
  };
}

const fixtures = JSON.parse(
  readFileSync(new URL('../fixtures/invoice-totals.json', import.meta.url), 'utf8'),
) as Fixture[];

describe('invoice totals fixtures (shared with SQL parity tests)', () => {
  it.each(fixtures)('$name', ({ lines, discount, taxMode, expected }) => {
    const result = computeInvoiceTotals(lines, discount, taxMode);
    expect(result.subtotalMinor).toBe(expected.subtotalMinor);
    expect(result.discountMinor).toBe(expected.discountMinor);
    expect(result.taxMinor).toBe(expected.taxMinor);
    expect(result.totalMinor).toBe(expected.totalMinor);
    expect(result.taxGroups).toEqual(expected.taxGroups);
  });
});
