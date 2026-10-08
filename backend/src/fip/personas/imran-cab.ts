/**
 * Persona: Imran Pasha (Cab Driver - Income Pass, Activity Fail)
 * 
 * Legitimate cab driver with high earnings when working, but has gaps in continuity:
 * - Timeline: May 2025 to Oct 2026 (~17 months)
 * - Average monthly income over last 6 completed months: > Rs 20,000 (passes income)
 * - Tenure: >= 12 months (passes history)
 * - Active months in last 12 completed months (Oct 2025 - Sep 2026): EXACTLY 8/12 months
 *   (Inactive months: Nov 2025, Feb 2026, May 2026, Jul 2026 due to personal family leaves)
 * - Target outcome on Microcredit (requires 9/12 active months):
 *   ACTIVITY CONDITION FAILS (8/12 < 9/12) with truthful per-condition PASS/FAIL.
 */

import type { RawTransaction } from '../types.js';

export function getImranTransactions(): RawTransaction[] {
  const txns: RawTransaction[] = [];
  let txnCounter = 3000;

  const uberRemitter = {
    name: 'UBER INDIA SYSTEMS PVT LTD',
    vpa: 'uberindia@hdfcbank',
    account: '001205099120',
    ifsc: 'HDFC0000012',
  };

  const addTxn = (
    tsSec: number,
    amountMinor: number,
    direction: 'CREDIT' | 'DEBIT',
    rail: 'UPI' | 'IMPS' | 'NEFT',
    remitter: { name?: string; vpa?: string; account?: string; ifsc?: string },
    refPrefix: string,
    narration: string
  ) => {
    txnCounter++;
    txns.push({
      txnId: `TXN_IMR_${txnCounter}`,
      timestamp: tsSec,
      amountMinor,
      currency: 'INR',
      direction,
      rail,
      remitter,
      reference: `${refPrefix}${txnCounter}`,
      narration,
    });
  };

  // Start May 2025 (e.g. May 10, 2025)
  let currentSec = Date.UTC(2025, 4, 10, 11, 0, 0) / 1000;
  const endSec = Date.UTC(2026, 9, 6, 12, 0, 0) / 1000;

  const weeklyAmounts = [785000, 842000, 810000, 865000];
  let wIdx = 0;

  while (currentSec <= endSec) {
    const dt = new Date(currentSec * 1000);
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth(); // 0 = Jan, 1 = Feb, ..., 11 = Dec

    // Inactive months:
    // Nov 2025 (year 2025, month 10)
    // Feb 2026 (year 2026, month 1)
    // May 2026 (year 2026, month 4)
    // Jul 2026 (year 2026, month 6)
    const isInactiveMonth =
      (year === 2025 && month === 10) ||
      (year === 2026 && (month === 1 || month === 4 || month === 6));

    if (!isInactiveMonth) {
      // High weekly payout
      addTxn(
        currentSec,
        weeklyAmounts[wIdx % weeklyAmounts.length],
        'CREDIT',
        'IMPS',
        uberRemitter,
        'IMPS_UBR_',
        `IMPS/UBER_PAYOUT/CAB_EARNINGS/${txnCounter}`
      );

      // Weekly fuel debit
      addTxn(
        currentSec + 86400,
        95000,
        'DEBIT',
        'UPI',
        { name: 'HP PETROL PUMP', vpa: 'hppump@sbi' },
        'UPI_HP_',
        'UPI/HP_PUMP/DIESEL'
      );
    }

    wIdx++;
    currentSec += 7 * 86400; // Next week
  }

  return txns.sort((a, b) => a.timestamp - b.timestamp);
}
