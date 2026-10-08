/**
 * Persona: Venkatesh R (Porter - Clustered Logistics Payouts)
 * 
 * Goods vehicle driver with legitimate uneven/clustered payouts:
 * - Timeline: Feb 2025 to Oct 2026 (~20 months)
 * - Payer: Porter (Resfeber Labs Pvt Ltd)
 * - Pattern: Large clustered payouts (Rs 12,000 - Rs 18,000) every 2-3 weeks,
 *   with intermediate weeks having zero payouts.
 * - Adequate overall history (20 months) and active in >= 9 of 12 completed months.
 * - Target outcome: PASSES applicable policy; demonstrates system does not attach
 *   a subjective 'irregular worker' score or rating.
 */

import type { RawTransaction } from '../types.js';

export function getVenkateshTransactions(): RawTransaction[] {
  const txns: RawTransaction[] = [];
  let txnCounter = 5000;

  const porterRemitter = {
    name: 'RESFEBER LABS PVT LTD',
    vpa: 'porterpayouts@yesbank',
    account: '003305077182',
    ifsc: 'YESB0000033',
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
      txnId: `TXN_VEN_${txnCounter}`,
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

  let currentSec = Date.UTC(2025, 1, 15, 14, 0, 0) / 1000; // Feb 15, 2025
  const endSec = Date.UTC(2026, 9, 5, 12, 0, 0) / 1000;

  const clusterAmounts = [1420000, 1680000, 1290000, 1850000, 1540000];
  let cIdx = 0;

  while (currentSec <= endSec) {
    // Clustered payout
    addTxn(
      currentSec,
      clusterAmounts[cIdx % clusterAmounts.length],
      'CREDIT',
      'IMPS',
      porterRemitter,
      'IMPS_PRT_',
      `IMPS/RESFEBER_LABS/PORTER_TRIP_PAYOUT/${txnCounter}`
    );

    // Fuel and toll debits
    addTxn(
      currentSec + 86400,
      120000,
      'DEBIT',
      'UPI',
      { name: 'IOCL FLEET PUMP' },
      'UPI_IOC_',
      'UPI/IOCL_FLEET/DIESEL'
    );
    addTxn(
      currentSec + 172800,
      45000,
      'DEBIT',
      'IMPS',
      { name: 'FASTAG TOLL' },
      'TOLL_NHAI_',
      'NETC/FASTAG_DEBIT'
    );

    cIdx++;
    // Interval between clusters varies: 14 to 21 days
    const intervalDays = (cIdx % 3 === 0) ? 21 : 14;
    currentSec += intervalDays * 86400;
  }

  return txns.sort((a, b) => a.timestamp - b.timestamp);
}
