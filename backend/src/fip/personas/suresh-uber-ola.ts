/**
 * Persona: Suresh Gowda (Uber + Ola Multi-Platform Aggregation)
 * 
 * Aggregates concurrent earnings from both Uber and Ola:
 * - Timeline: Nov 2024 to Oct 2026 (~23 months)
 * - Uber weekly payouts: ~Rs 3,500 - Rs 5,000
 * - Ola weekly payouts: ~Rs 3,200 - Rs 4,800
 * - Combined monthly earnings: ~Rs 28,000 - Rs 38,000
 * - Active months in last 12 completed months: 11/12 (took a break in March 2026)
 * - Target outcome: PASSES Microcredit loan policy through multi-platform aggregation.
 */

import type { RawTransaction } from '../types.js';

export function getSureshTransactions(): RawTransaction[] {
  const txns: RawTransaction[] = [];
  let txnCounter = 2000;

  const uberRemitter = {
    name: 'UBER INDIA SYSTEMS PVT LTD',
    vpa: 'uberindia@hdfcbank',
    account: '001205099120',
    ifsc: 'HDFC0000012',
  };

  const olaRemitter = {
    name: 'ANI TECHNOLOGIES PRIVATE LIMITED',
    vpa: 'anitechnologies@axisbank',
    account: '918020045512',
    ifsc: 'UTIB0000050',
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
      txnId: `TXN_SUR_${txnCounter}`,
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

  let currentSec = Date.UTC(2024, 10, 10, 9, 0, 0) / 1000; // Nov 10, 2024
  const endSec = Date.UTC(2026, 9, 5, 14, 0, 0) / 1000; // Oct 5, 2026

  const uberAmounts = [385000, 421000, 395000, 482000, 360000, 451000];
  const olaAmounts = [345000, 372000, 321000, 415000, 389000, 355000];
  let idx = 0;

  while (currentSec <= endSec) {
    // Check if within Suresh's vacation break in March 2026 (2026-03-05 to 2026-03-28)
    const dt = new Date(currentSec * 1000);
    const isBreak = dt.getUTCFullYear() === 2026 && dt.getUTCMonth() === 2 && dt.getUTCDate() < 28;

    if (!isBreak) {
      // Uber payout on Tuesdays
      addTxn(
        currentSec,
        uberAmounts[idx % uberAmounts.length],
        'CREDIT',
        'IMPS',
        uberRemitter,
        'IMPS_UBR_',
        `IMPS/UBER_PAYOUT/DRIVER_EARNINGS/${txnCounter}`
      );

      // Ola payout on Thursdays (2 days later)
      addTxn(
        currentSec + 172800,
        olaAmounts[idx % olaAmounts.length],
        'CREDIT',
        'NEFT',
        olaRemitter,
        'NEFT_OLA_',
        `NEFT/ANI_TECH/OLA_PAYOUT/${txnCounter}`
      );

      // CNG fuel debit
      addTxn(
        currentSec + 86400,
        65000,
        'DEBIT',
        'UPI',
        { name: 'GAIL GAS STATION', vpa: 'gailgas@icici' },
        'UPI_CNG_',
        'UPI/CNG_FUEL/BANGALORE'
      );
    }

    // Vehicle EMI debit once a month (around 10th)
    if (dt.getUTCDate() >= 8 && dt.getUTCDate() <= 14) {
      addTxn(
        currentSec + 43200,
        850000, // Rs 8,500 car loan EMI
        'DEBIT',
        'NEFT',
        { name: 'HDFC BANK AUTO LOAN' },
        'EMI_HDFC_',
        'NEFT/AUTO_LOAN_EMI'
      );
    }

    idx++;
    currentSec += 7 * 86400; // Next week
  }

  return txns.sort((a, b) => a.timestamp - b.timestamp);
}
