/**
 * Persona: Farhan Ali (Swiggy -> Zomato Platform Switch)
 * 
 * Demonstrates cross-platform portability under a single passport:
 * - Timeline: April 2024 to October 2026 (~30 months total tenure)
 * - Apr 2024 to Nov 2025: Swiggy payouts (Bundl Technologies Pvt Ltd)
 * - Oct 2025 to Nov 2025: Brief transition overlap (earned from both)
 * - Nov 2025 to Oct 2026: Zomato payouts (Zomato Limited)
 * - Steady weekly earnings: ~Rs 6,500 - Rs 8,000
 * - Target outcome: PASSES continuous history and activity policy across platform change.
 */

import type { RawTransaction } from '../types.js';

export function getFarhanTransactions(): RawTransaction[] {
  const txns: RawTransaction[] = [];
  let txnCounter = 6000;

  const swiggyRemitter = {
    name: 'BUNDL TECHNOLOGIES PRIVATE LIMITED',
    vpa: 'bundltechnologies@icici',
    account: '000405019821',
    ifsc: 'ICIC0000004',
  };

  const zomatoRemitter = {
    name: 'ZOMATO LIMITED',
    vpa: 'zomatopayouts@hdfcbank',
    account: '002905088190',
    ifsc: 'HDFC0000029',
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
      txnId: `TXN_FAR_${txnCounter}`,
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

  let currentSec = Date.UTC(2024, 3, 10, 10, 0, 0) / 1000; // Apr 10, 2024
  const endSec = Date.UTC(2026, 9, 6, 12, 0, 0) / 1000;
  const switchStartSec = Date.UTC(2025, 9, 1, 0, 0, 0) / 1000; // Oct 1, 2025
  const switchEndSec = Date.UTC(2025, 10, 30, 23, 59, 59) / 1000; // Nov 30, 2025

  const payoutAmounts = [680000, 740000, 715000, 790000, 725000, 765000];
  let pIdx = 0;

  while (currentSec <= endSec) {
    const isSwiggyPhase = currentSec < switchEndSec;
    const isZomatoPhase = currentSec >= switchStartSec;

    if (isSwiggyPhase && isZomatoPhase) {
      // Overlap phase: split earnings
      addTxn(
        currentSec,
        380000,
        'CREDIT',
        'UPI',
        swiggyRemitter,
        'UPI_SWG_',
        `UPI/SWIGGY/PARTNER_PAYOUT/${txnCounter}`
      );
      addTxn(
        currentSec + 172800,
        360000,
        'CREDIT',
        'IMPS',
        zomatoRemitter,
        'IMPS_ZOM_',
        `IMPS/ZOMATO_LTD/SETTLEMENT/${txnCounter}`
      );
    } else if (isSwiggyPhase) {
      addTxn(
        currentSec,
        payoutAmounts[pIdx % payoutAmounts.length],
        'CREDIT',
        'UPI',
        swiggyRemitter,
        'UPI_SWG_',
        `UPI/SWIGGY/PARTNER_PAYOUT/${txnCounter}`
      );
    } else {
      addTxn(
        currentSec,
        payoutAmounts[pIdx % payoutAmounts.length],
        'CREDIT',
        'IMPS',
        zomatoRemitter,
        'IMPS_ZOM_',
        `IMPS/ZOMATO_LTD/SETTLEMENT/${txnCounter}`
      );
    }

    // Weekly fuel debit
    addTxn(
      currentSec + 86400,
      48000,
      'DEBIT',
      'UPI',
      { name: 'BPCL PETROL PUMP' },
      'UPI_BPCL_',
      'UPI/BPCL/PETROL'
    );

    pIdx++;
    currentSec += 7 * 86400;
  }

  return txns.sort((a, b) => a.timestamp - b.timestamp);
}
