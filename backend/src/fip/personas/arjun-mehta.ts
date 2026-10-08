/**
 * Persona: Arjun Mehta (Security Persona)
 * 
 * Legitimate delivery partner baseline used for controlled security/tamper testing:
 * - Timeline: August 2025 to October 2026 (~14 months)
 * - Payer: Zomato Limited
 * - Weekly payouts: ~Rs 5,000 - Rs 5,800 (~Rs 21,000 - Rs 24,000/month)
 * - Baseline dataset is completely legitimate and valid.
 * - Used to demonstrate stage-accurate failures:
 *   1. FIP payload tampering (1 paise or remitter alteration) -> signature verification fails
 *   2. Account-owner identity mismatch -> attestation rejects before mint/refresh
 *   3. Expired or revoked consent -> attestation fetch rejects
 */

import type { RawTransaction } from '../types.js';

export function getArjunTransactions(): RawTransaction[] {
  const txns: RawTransaction[] = [];
  let txnCounter = 7000;

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
      txnId: `TXN_ARJ_${txnCounter}`,
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

  let currentSec = Date.UTC(2025, 7, 12, 10, 0, 0) / 1000; // Aug 12, 2025
  const endSec = Date.UTC(2026, 9, 6, 12, 0, 0) / 1000;

  const weeklyAmounts = [512000, 545000, 528000, 564000, 539000];
  let idx = 0;

  while (currentSec <= endSec) {
    addTxn(
      currentSec,
      weeklyAmounts[idx % weeklyAmounts.length],
      'CREDIT',
      'UPI',
      zomatoRemitter,
      'UPI_ZOM_',
      `UPI/ZOMATO/DELIVERY_EARNINGS/${txnCounter}`
    );

    // Fuel debit
    addTxn(
      currentSec + 86400,
      42000,
      'DEBIT',
      'UPI',
      { name: 'IOCL FUEL POINT' },
      'UPI_IOC_',
      'UPI/IOCL/PETROL'
    );

    idx++;
    currentSec += 7 * 86400;
  }

  return txns.sort((a, b) => a.timestamp - b.timestamp);
}
