/**
 * Persona: Manjunath S (Urban Company - History Fail)
 * 
 * Legitimate home-services professional with fresh tenure:
 * - Timeline: June 2026 to Oct 2026 (~4 months of authenticated work)
 * - Payer: Urban Company (UrbanClap Technologies India Pvt Ltd)
 * - Weekly payouts: ~Rs 5,500 - Rs 6,500 (Rs 22,000 - Rs 26,000/month)
 * - Active every single week since joining
 * - Target outcome: Valid ACTIVE passport, but FAILS WelfareVault (requires >= 6 months)
 *   and FAILS Microcredit (requires >= 12 months) solely on the history tenure condition.
 */

import type { RawTransaction } from '../types.js';

export function getManjunathTransactions(): RawTransaction[] {
  const txns: RawTransaction[] = [];
  let txnCounter = 4000;

  const ucRemitter = {
    name: 'URBANCLAP TECHNOLOGIES INDIA PVT LTD',
    vpa: 'urbancompany@icici',
    account: '000505088219',
    ifsc: 'ICIC0000005',
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
      txnId: `TXN_MAN_${txnCounter}`,
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

  // Start June 10, 2026
  let currentSec = Date.UTC(2026, 5, 10, 10, 0, 0) / 1000;
  const endSec = Date.UTC(2026, 9, 6, 12, 0, 0) / 1000;

  const weeklyAmounts = [585000, 624000, 560000, 642000, 610000];
  let wIdx = 0;

  while (currentSec <= endSec) {
    addTxn(
      currentSec,
      weeklyAmounts[wIdx % weeklyAmounts.length],
      'CREDIT',
      'UPI',
      ucRemitter,
      'UPI_UC_',
      `UPI/URBAN_COMPANY/SERVICE_PAYOUT/${txnCounter}`
    );

    // Equipment supplies debit
    addTxn(
      currentSec + 86400,
      35000,
      'DEBIT',
      'UPI',
      { name: 'HARDWARE STORE', vpa: 'toolsmart@axisbank' },
      'UPI_TLS_',
      'UPI/TOOL_SMART/SUPPLIES'
    );

    wIdx++;
    currentSec += 7 * 86400;
  }

  return txns.sort((a, b) => a.timestamp - b.timestamp);
}
