/**
 * GigVault - Conservative Transaction Classifier
 * 
 * Classifies authentic bank transactions against the versioned payout directory:
 * - CREDITs from recognized originators matching curated remitter metadata -> COUNTED
 * - DEBITs -> NOT_RELEVANT_DEBIT (never counted as gig income)
 * - Credits with unrecognized remitter -> EXCLUDED_UNRECOGNIZED (narration alone never counts!)
 * - Personal/friend/self credits -> EXCLUDED_PERSONAL
 */

import type { RawTransaction } from '../fip/types.js';
import { getDirectoryForVersion, CURRENT_DIRECTORY_VERSION } from './directory/registry.js';
import type { PayoutSourceEntry } from './directory/types.js';

export type ClassificationCategory =
  | 'COUNTED'
  | 'EXCLUDED_UNRECOGNIZED'
  | 'EXCLUDED_PERSONAL'
  | 'NOT_RELEVANT_DEBIT';

export interface ClassifiedTransaction {
  raw: RawTransaction;
  category: ClassificationCategory;
  isGigIncome: boolean;
  matchedPlatform?: string;
  matchedSourceId?: string;
  classificationReason: string;
}

export class TransactionClassifier {
  private directoryVersion: number;
  private activeEntries: PayoutSourceEntry[];

  constructor(directoryVersion: number = CURRENT_DIRECTORY_VERSION) {
    this.directoryVersion = directoryVersion;
    this.activeEntries = getDirectoryForVersion(directoryVersion).entries;
  }

  public getDirectoryVersion(): number {
    return this.directoryVersion;
  }

  /**
   * Classify a single transaction against the active directory version.
   */
  public classifyTransaction(txn: RawTransaction): ClassifiedTransaction {
    // 1. Direction check: DEBITs are not gig income
    if (txn.direction === 'DEBIT') {
      return {
        raw: txn,
        category: 'NOT_RELEVANT_DEBIT',
        isGigIncome: false,
        classificationReason: 'Not relevant · Debit transaction',
      };
    }

    // 2. Check personal / friend transfer patterns in remitter
    const remitterName = (txn.remitter.name || '').toUpperCase();
    const remitterVpa = (txn.remitter.vpa || '').toLowerCase();

    // 3. Match against curated payout-source directory
    for (const entry of this.activeEntries) {
      const criteria = entry.criteria;

      // Rail check if specified
      if (criteria.allowedRails && !criteria.allowedRails.includes(txn.rail)) {
        continue;
      }

      // Check VPA match
      const vpaMatch =
        remitterVpa &&
        criteria.vpaList &&
        criteria.vpaList.some((vpa) => remitterVpa === vpa.toLowerCase());

      // Check Account Number match
      const accountMatch =
        txn.remitter.account &&
        criteria.accountNumbers &&
        criteria.accountNumbers.includes(txn.remitter.account);

      // Check Remitter Legal Entity / Name match
      const nameMatch =
        remitterName &&
        criteria.remitterNames &&
        criteria.remitterNames.some((name) => remitterName === name.toUpperCase());

      // If authentic metadata matches, classify as COUNTED
      if (vpaMatch || accountMatch || nameMatch) {
        return {
          raw: txn,
          category: 'COUNTED',
          isGigIncome: true,
          matchedPlatform: entry.platformName,
          matchedSourceId: entry.id,
          classificationReason: `Counted · ${entry.platformName}`,
        };
      }
    }

    // 4. If narration mentions platform but authentic remitter does NOT match:
    // EXCLUDE! Narration alone is NEVER sufficient.
    const narrationUpper = txn.narration.toUpperCase();
    const mentionsPlatform = ['SWIGGY', 'ZOMATO', 'UBER', 'OLA', 'PORTER', 'URBAN COMPANY'].some(
      (p) => narrationUpper.includes(p)
    );

    if (mentionsPlatform) {
      return {
        raw: txn,
        category: 'EXCLUDED_UNRECOGNIZED',
        isGigIncome: false,
        classificationReason: 'Excluded · Unrecognized payer (narration alone is insufficient)',
      };
    }

    // 5. Personal / Unrecognized credit
    if (narrationUpper.includes('FRIEND') || narrationUpper.includes('FAMILY') || narrationUpper.includes('SALARY')) {
      return {
        raw: txn,
        category: 'EXCLUDED_PERSONAL',
        isGigIncome: false,
        classificationReason: 'Excluded · Personal or unrelated transfer',
      };
    }

    return {
      raw: txn,
      category: 'EXCLUDED_UNRECOGNIZED',
      isGigIncome: false,
      classificationReason: 'Excluded · Unrecognized payout source',
    };
  }

  /**
   * Classify an array of transactions.
   */
  public classifyAll(txns: RawTransaction[]): ClassifiedTransaction[] {
    return txns.map((t) => this.classifyTransaction(t));
  }
}
