import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  computeInvoiceTotals,
  formatMoney,
  money,
  type CurrencyCode,
  type Discount,
  type LineInput,
} from '@freelanceit/domain';

interface DemoLine {
  id: string;
  description: string;
  qtyMilli: number;
  unitPriceMinor: number;
  taxLabel: string;
  taxRateBp: number;
  included: boolean;
  type: 'time' | 'fixed' | 'expense';
  displayQty: string;
}

interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  label: string;
  rateMultiplier: number;
}

@Component({
  imports: [CommonModule, FormsModule],
  selector: 'app-landing',
  styleUrl: './landing.scss',
  templateUrl: './landing.html',
})
export class LandingComponent {
  // Currency selection
  protected readonly currencies: CurrencyConfig[] = [
    { code: 'NGN', label: 'Nigerian Naira (₦)', rateMultiplier: 1, symbol: '₦' },
    { code: 'USD', label: 'US Dollar ($)', rateMultiplier: 0.00067, symbol: '$' },
    { code: 'GBP', label: 'British Pound (£)', rateMultiplier: 0.00052, symbol: '£' },
    { code: 'EUR', label: 'Euro (€)', rateMultiplier: 0.00062, symbol: '€' },
  ];
  protected readonly selectedCurrency = signal<CurrencyCode>('NGN');

  // Interactive Invoice Demo State
  protected readonly isFrozen = signal<boolean>(true);
  protected readonly taxRateOption = signal<number>(750); // 7.5% VAT
  protected readonly discountPercent = signal<number>(0); // 0% or 10%

  protected readonly demoLines = signal<DemoLine[]>([
    {
      description: 'API Design & Database Architecture (Northwind)',
      displayQty: '12.5h',
      id: 'line-1',
      included: true,
      qtyMilli: 12500,
      taxLabel: 'VAT',
      taxRateBp: 750,
      type: 'time',
      unitPriceMinor: 1500000, // ₦15,000 / hr in minor units (1,500,000 kobo)
    },
    {
      description: 'Staging Deployment & SSL Hardening',
      displayQty: '1 fixed',
      id: 'line-2',
      included: true,
      qtyMilli: 1000,
      taxLabel: 'VAT',
      taxRateBp: 750,
      type: 'fixed',
      unitPriceMinor: 4500000, // ₦45,000
    },
    {
      description: 'Custom Domain & Cloud Storage Pass-through',
      displayQty: '1 receipt',
      id: 'line-3',
      included: true,
      qtyMilli: 1000,
      taxLabel: 'Zero',
      taxRateBp: 0,
      type: 'expense',
      unitPriceMinor: 1820000, // ₦18,200
    },
    {
      description: 'Load Testing & Query Benchmark Report',
      displayQty: '6.0h',
      id: 'line-4',
      included: false,
      qtyMilli: 6000,
      taxLabel: 'VAT',
      taxRateBp: 750,
      type: 'time',
      unitPriceMinor: 1500000, // ₦15,000 / hr
    },
  ]);

  // Computed Invoice Totals using @freelanceit/domain
  protected readonly invoiceTotals = computed(() => {
    const cur = this.selectedCurrency();
    const config = this.currencies.find((c) => c.code === cur)!;
    const lines = this.demoLines()
      .filter((l) => l.included)
      .map((l) => {
        // Adjust for currency rate
        const rawUnitPrice = Math.round(l.unitPriceMinor * config.rateMultiplier);
        return {
          qtyMilli: l.qtyMilli,
          taxLabel: l.taxLabel,
          taxRateBp: l.taxLabel === 'Zero' ? 0 : this.taxRateOption(),
          unitPriceMinor: rawUnitPrice,
        } satisfies LineInput;
      });

    const discount: Discount =
      this.discountPercent() > 0
        ? { type: 'percent', valueBp: this.discountPercent() * 100 }
        : { type: 'none' };

    const totals = computeInvoiceTotals(lines, discount, 'exclusive');
    return {
      balanceFormatted: formatMoney(money(totals.totalMinor, cur)),
      discountFormatted: formatMoney(money(totals.discountMinor, cur)),
      raw: totals,
      subtotalFormatted: formatMoney(money(totals.subtotalMinor, cur)),
      taxFormatted: formatMoney(money(totals.taxMinor, cur)),
      totalFormatted: formatMoney(money(totals.totalMinor, cur)),
    };
  });

  // Active Workflow Move Tab
  protected readonly activeMove = signal<number>(1);

  // Client Portal Simulation state
  protected readonly portalPaymentStatus = signal<'unpaid' | 'claimed' | 'confirmed'>('unpaid');
  protected readonly portalNotice = signal<string>(
    'Client opens the unguessable link. No account, no password, no friction.',
  );
  protected readonly portalToken = signal<string>('tok_94f2a781b0c9e');

  // ROI Calculator State
  protected readonly monthlyInvoices = signal<number>(6);
  protected readonly hourlyRate = signal<number>(75);
  protected readonly savedHoursPerMonth = computed(() => {
    return (this.monthlyInvoices() * 2.2).toFixed(1);
  });
  protected readonly annualValueSaved = computed(() => {
    const hours = this.monthlyInvoices() * 2.2 * 12;
    return Math.round(hours * this.hourlyRate()).toLocaleString();
  });

  // Waitlist Form State
  protected readonly waitlistName = signal<string>('');
  protected readonly waitlistEmail = signal<string>('');
  protected readonly waitlistRole = signal<string>('Developer / Engineer');
  protected readonly waitlistSubmitted = signal<boolean>(false);
  protected readonly generatedEarlyToken = signal<string>('');

  // Active Running Timer Simulation
  protected readonly timerSeconds = signal<number>(5542); // 1h 32m 22s
  protected readonly timerRunning = signal<boolean>(true);

  protected formattedTimer = computed(() => {
    const totalSec = this.timerSeconds();
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  });

  // Actions
  protected setCurrency(code: CurrencyCode): void {
    this.selectedCurrency.set(code);
  }

  protected toggleLine(lineId: string): void {
    this.demoLines.update((lines) =>
      lines.map((line) => (line.id === lineId ? { ...line, included: !line.included } : line)),
    );
  }

  protected toggleFreeze(): void {
    this.isFrozen.update((v) => !v);
  }

  protected setMove(move: number): void {
    this.activeMove.set(move);
  }

  protected simulateClientPayment(): void {
    this.portalPaymentStatus.set('claimed');
    this.portalNotice.set(
      'Payment claimed by client (Ref: TX-90823). The owner is notified to reconcile before it affects the balance.',
    );
  }

  protected simulateDownloadPdf(): void {
    this.portalNotice.set(
      'PDF served directly from the immutable issued snapshot. No recalculation drift.',
    );
  }

  protected rotateToken(): void {
    const newTok = 'tok_' + Math.random().toString(36).substring(2, 15);
    this.portalToken.set(newTok);
    this.portalPaymentStatus.set('unpaid');
    this.portalNotice.set(
      `Token rotated to ${newTok}. The previous link is instantly deactivated with HTTP 404/410.`,
    );
  }

  protected submitWaitlist(e: Event): void {
    e.preventDefault();
    if (!this.waitlistEmail()) return;

    const mockToken =
      'tok_beta_' +
      Math.random().toString(36).substring(2, 10) +
      '_' +
      this.waitlistEmail().split('@')[0];
    this.generatedEarlyToken.set(mockToken);
    this.waitlistSubmitted.set(true);
  }

  protected formatLinePrice(minor: number): string {
    const cur = this.selectedCurrency();
    const config = this.currencies.find((c) => c.code === cur)!;
    const adjusted = Math.round(minor * config.rateMultiplier);
    return formatMoney(money(adjusted, cur));
  }
}
