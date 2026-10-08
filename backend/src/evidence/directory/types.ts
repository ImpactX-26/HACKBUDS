/**
 * GigVault - Payout-Source Directory Types
 * 
 * Append-only versioned registry of recognized gig payout originators.
 * Matches authentic remitter metadata (VPA, account, remitter name, IFSC, rails).
 * Never matches human-readable narration alone.
 */

import type { PaymentRail } from '../../fip/types.js';

export interface PayoutMatchCriteria {
  vpaList?: string[];
  accountNumbers?: string[];
  ifscPrefixes?: string[];
  remitterNames?: string[];
  allowedRails?: PaymentRail[];
}

export interface PayoutSourceEntry {
  id: string;
  platformName: string;
  legalEntity: string;
  introducedInVersion: number;
  deactivatedInVersion?: number;
  criteria: PayoutMatchCriteria;
}

export interface DirectoryVersionInfo {
  version: number;
  activeEntriesCount: number;
  entries: PayoutSourceEntry[];
}
