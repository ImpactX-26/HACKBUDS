/**
 * GigVault - Persona Identity & Metadata Constants
 * 
 * Defines the 7 approved realistic personas and their pre-established
 * synthetic identity nullifiers (simulating Anon Aadhaar / mock identity provider).
 */

export interface PersonaMetadata {
  id: string;
  name: string;
  accountId: string;
  identityNullifierHash: string; // 32-byte hex app-scoped identity nullifier
  platformDescription: string;
  expectedOutcomeSummary: string;
}

export const PERSONAS: Record<string, PersonaMetadata> = {
  RAMESH: {
    id: 'RAMESH',
    name: 'Ramesh Kumar',
    accountId: 'ACC_RAMESH_SWIGGY_001',
    identityNullifierHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
    platformDescription: 'Swiggy full-time delivery partner (Jan 2024 - Oct 2026)',
    expectedOutcomeSummary: 'Hero persona: passes both WelfareVault and Microcredit',
  },
  SURESH: {
    id: 'SURESH',
    name: 'Suresh Gowda',
    accountId: 'ACC_SURESH_UBER_OLA_002',
    identityNullifierHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
    platformDescription: 'Concurrent Uber + Ola aggregation (Nov 2024 - Oct 2026)',
    expectedOutcomeSummary: 'Passes Microcredit via multi-platform parallel earnings aggregation',
  },
  IMRAN: {
    id: 'IMRAN',
    name: 'Imran Pasha',
    accountId: 'ACC_IMRAN_CAB_003',
    identityNullifierHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
    platformDescription: 'Cab driver with high average income but 8/12 active months in past year',
    expectedOutcomeSummary: 'Valid proof, income passes (>20k avg), but activity 8/12 fails 9/12 loan policy',
  },
  MANJUNATH: {
    id: 'MANJUNATH',
    name: 'Manjunath S',
    accountId: 'ACC_MANJUNATH_UC_004',
    identityNullifierHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
    platformDescription: 'Urban Company home services (~4 months tenure, June 2026 - Oct 2026)',
    expectedOutcomeSummary: 'Valid ACTIVE passport, but fails min history >= 6 months welfare and >= 12 months loan',
  },
  VENKATESH: {
    id: 'VENKATESH',
    name: 'Venkatesh R',
    accountId: 'ACC_VENKATESH_PORTER_005',
    identityNullifierHash: '0x5555555555555555555555555555555555555555555555555555555555555555',
    platformDescription: 'Porter goods logistics with clustered/irregular payout sizes',
    expectedOutcomeSummary: 'Passes applicable policy; illustrates no subjective irregular worker rating',
  },
  FARHAN: {
    id: 'FARHAN',
    name: 'Farhan Ali',
    accountId: 'ACC_FARHAN_TRANSITION_006',
    identityNullifierHash: '0x6666666666666666666666666666666666666666666666666666666666666666',
    platformDescription: 'Swiggy -> Zomato platform switch on same portable passport',
    expectedOutcomeSummary: 'Passes continuous history policy across platform switch',
  },
  ARJUN: {
    id: 'ARJUN',
    name: 'Arjun Mehta',
    accountId: 'ACC_ARJUN_SECURITY_007',
    identityNullifierHash: '0x7777777777777777777777777777777777777777777777777777777777777777',
    platformDescription: 'Delivery partner baseline used for controlled tamper and security tests',
    expectedOutcomeSummary: 'Security testing: triggers stage-accurate signature/binding rejections',
  },
};
