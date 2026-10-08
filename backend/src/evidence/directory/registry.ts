/**
 * GigVault - Curated Payout-Source Directory Registry
 * 
 * Append-only versioned catalog of recognized gig platforms in India:
 * - Version 1: Swiggy, Uber, Ola, Urban Company, Porter
 * - Version 2: Added Zomato
 * - Version 3: Added Shadowfax, deactivated legacy Ola bank account
 * 
 * Adheres to Decision Register GV-014 and GV-015:
 * Historical directory versions can be reconstructed deterministically without
 * duplicating full directory snapshots.
 */

import type { PayoutSourceEntry, DirectoryVersionInfo } from './types.js';

export const CURRENT_DIRECTORY_VERSION = 3;

export const PAYOUT_DIRECTORY_ENTRIES: PayoutSourceEntry[] = [
  // Version 1 Platforms
  {
    id: 'SRC_SWIGGY_01',
    platformName: 'Swiggy',
    legalEntity: 'BUNDL TECHNOLOGIES PRIVATE LIMITED',
    introducedInVersion: 1,
    criteria: {
      vpaList: ['bundltechnologies@icici', 'swiggypayouts@icici'],
      accountNumbers: ['000405019821'],
      ifscPrefixes: ['ICIC'],
      remitterNames: ['BUNDL TECHNOLOGIES PRIVATE LIMITED', 'BUNDL TECH PVT LTD'],
      allowedRails: ['UPI', 'IMPS', 'NEFT'],
    },
  },
  {
    id: 'SRC_UBER_01',
    platformName: 'Uber',
    legalEntity: 'UBER INDIA SYSTEMS PVT LTD',
    introducedInVersion: 1,
    criteria: {
      vpaList: ['uberindia@hdfcbank', 'uberpayouts@hdfcbank'],
      accountNumbers: ['001205099120'],
      ifscPrefixes: ['HDFC'],
      remitterNames: ['UBER INDIA SYSTEMS PVT LTD'],
      allowedRails: ['UPI', 'IMPS', 'NEFT'],
    },
  },
  {
    id: 'SRC_OLA_01',
    platformName: 'Ola',
    legalEntity: 'ANI TECHNOLOGIES PRIVATE LIMITED',
    introducedInVersion: 1,
    criteria: {
      vpaList: ['anitechnologies@axisbank', 'olapayouts@axisbank'],
      accountNumbers: ['918020045512'],
      ifscPrefixes: ['UTIB'],
      remitterNames: ['ANI TECHNOLOGIES PRIVATE LIMITED', 'ANI TECH PVT LTD'],
      allowedRails: ['UPI', 'IMPS', 'NEFT'],
    },
  },
  {
    id: 'SRC_URBAN_COMPANY_01',
    platformName: 'Urban Company',
    legalEntity: 'URBANCLAP TECHNOLOGIES INDIA PVT LTD',
    introducedInVersion: 1,
    criteria: {
      vpaList: ['urbancompany@icici', 'ucpayouts@icici'],
      accountNumbers: ['000505088219'],
      ifscPrefixes: ['ICIC'],
      remitterNames: ['URBANCLAP TECHNOLOGIES INDIA PVT LTD', 'URBAN COMPANY'],
      allowedRails: ['UPI', 'IMPS', 'NEFT'],
    },
  },
  {
    id: 'SRC_PORTER_01',
    platformName: 'Porter',
    legalEntity: 'RESFEBER LABS PVT LTD',
    introducedInVersion: 1,
    criteria: {
      vpaList: ['porterpayouts@yesbank', 'resfeberlabs@yesbank'],
      accountNumbers: ['003305077182'],
      ifscPrefixes: ['YESB'],
      remitterNames: ['RESFEBER LABS PVT LTD'],
      allowedRails: ['UPI', 'IMPS', 'NEFT'],
    },
  },

  // Version 2 Addition: Zomato introduced in v2
  {
    id: 'SRC_ZOMATO_01',
    platformName: 'Zomato',
    legalEntity: 'ZOMATO LIMITED',
    introducedInVersion: 2,
    criteria: {
      vpaList: ['zomatopayouts@hdfcbank', 'zomatolimited@hdfcbank'],
      accountNumbers: ['002905088190'],
      ifscPrefixes: ['HDFC'],
      remitterNames: ['ZOMATO LIMITED', 'ZOMATO MEDIA PVT LTD'],
      allowedRails: ['UPI', 'IMPS', 'NEFT'],
    },
  },

  // Version 3 Addition: Shadowfax introduced in v3
  {
    id: 'SRC_SHADOWFAX_01',
    platformName: 'Shadowfax',
    legalEntity: 'SHADOWFAX TECHNOLOGIES PVT LTD',
    introducedInVersion: 3,
    criteria: {
      vpaList: ['shadowfax@kotak', 'shadowfaxpayouts@kotak'],
      accountNumbers: ['004405033100'],
      ifscPrefixes: ['KKBK'],
      remitterNames: ['SHADOWFAX TECHNOLOGIES PVT LTD'],
      allowedRails: ['UPI', 'IMPS', 'NEFT'],
    },
  },
];

/**
 * Reconstruct the active directory mappings for an exact historical version.
 * If an entry was introduced after targetVersion, it is excluded.
 * If an entry was deactivated before or on targetVersion, it is excluded.
 */
export function getDirectoryForVersion(version: number): DirectoryVersionInfo {
  if (version < 1) {
    throw new Error(`Invalid sourceDirectoryVersion: ${version}. Must be >= 1.`);
  }

  const activeEntries = PAYOUT_DIRECTORY_ENTRIES.filter((entry) => {
    const introduced = entry.introducedInVersion <= version;
    const notDeactivated = !entry.deactivatedInVersion || entry.deactivatedInVersion > version;
    return introduced && notDeactivated;
  });

  return {
    version,
    activeEntriesCount: activeEntries.length,
    entries: activeEntries,
  };
}
