/**
 * Persona: Ramesh Kumar (Swiggy Hero)
 * 
 * Legitimate full-time delivery partner with Swiggy from Jan 2024 to Oct 2026 (~34 months).
 * - Weekly recognized payouts from Bundl Technologies (Swiggy): ~Rs 6,000 - Rs 8,500
 * - Monthly recognized income: ~Rs 25,000 - Rs 34,000
 * - Active months in last 12 completed months: 12/12
 * - Active weeks in last 52 completed weeks: ~46-48 weeks
 * - Contains realistic debits (ATM, groceries, fuel) and non-gig credits (friend repayment).
 * - Target outcome: PASSES both WelfareVault and Microcredit policies.
 */

import type { RawTransaction } from '../types.js';

export function getRameshTransactions(): RawTransaction[] {
  const txns: RawTransaction[] = [];
  let txnCounter = 1000;

  // Swiggy remitter metadata
  const swiggyRemitter = {
    name: 'BUNDL TECHNOLOGIES PRIVATE LIMITED',
    vpa: 'bundltechnologies@icici',
    account: '000405019821',
    ifsc: 'ICIC0000004',
  };

  // Helper to push transaction
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
      txnId: `TXN_RAM_${txnCounter}`,
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

  // Date range: 2024-01-05 to 2026-10-06 (UTC)
  // Step weekly (every 7 days)
  let currentSec = Date.UTC(2024, 0, 5, 10, 30, 0) / 1000;
  const endSec = Date.UTC(2026, 9, 6, 12, 0, 0) / 1000;

  // Base payout amounts in paise (Rs 6,200 to Rs 8,400)
  const payoutVariations = [
    645250, 712000, 689000, 785400, 621000, 834500, 756000, 698500,
    723000, 814200, 665000, 742000, 825000, 678900, 791200, 735000,
  ];
  let vIdx = 0;

  while (currentSec <= endSec) {
    const amount = payoutVariations[vIdx % payoutVariations.length];
    vIdx++;

    // Add Swiggy weekly payout credit
    addTxn(
      currentSec,
      amount,
      'CREDIT',
      'UPI',
      swiggyRemitter,
      'UTR_SWG_',
      `UPI/SWIGGY_PAYOUT/BUNDL_TECH/${txnCounter}`
    );

    // Realistic debit: fuel or groceries 2 days later
    addTxn(
      currentSec + 172800,
      45000 + ((txnCounter * 37) % 35000), // Rs 450 - Rs 800
      'DEBIT',
      'UPI',
      { name: 'SHELL PETROL PUMP', vpa: 'shellauto@hdfcbank' },
      'UPI_DEB_',
      'UPI/SHELL_AUTO/FUEL'
    );

    // Occasional ATM debit (every 4th week)
    if (vIdx % 4 === 0) {
      addTxn(
        currentSec + 259200,
        200000, // Rs 2,000 cash withdrawal
        'DEBIT',
        'IMPS',
        { name: 'ATM CASH WITHDRAWAL' },
        'ATM_WDL_',
        'ATM/CASH_WDL/KORAMANGALA'
      );
    }

    // Occasional non-gig credit: friend personal transfer (must be EXCLUDED by GigVault!)
    if (vIdx === 15 || vIdx === 45 || vIdx === 80) {
      addTxn(
        currentSec + 86400,
        50000, // Rs 500
        'CREDIT',
        'UPI',
        { name: 'SANJAY SHARMA', vpa: 'sanjay_sharma@okhdfcbank' },
        'UPI_FRND_',
        'UPI/SANJAY/FRIEND_REPAYMENT'
      );
    }

    // Advance 7 days
    currentSec += 7 * 86400;
  }

  // Ensure deterministic sort by timestamp ascending
  return txns.sort((a, b) => a.timestamp - b.timestamp);
}
