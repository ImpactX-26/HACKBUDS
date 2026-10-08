/**
 * GigVault - Generate Proposal Fixture for Backend B (Gate 1)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockFIPStorage } from '../src/fip/storage.js';
import { ConsentService } from '../src/fip/consent-service.js';
import { MockFIPService } from '../src/fip/fip-service.js';
import { AttestationService } from '../src/evidence/attestation-service.js';
import { PERSONAS } from '../src/fip/personas/index.js';
import {
  addressToFieldElement,
  providerIdToFieldElement,
  hashToFieldElement,
  BN254_SCALAR_FIELD_MODULUS,
} from '../src/proposal/canonical-evidence-schema.js';

const storage = new MockFIPStorage();
const consentService = new ConsentService(storage);
const fipService = new MockFIPService(storage, consentService);
const attestationService = new AttestationService(fipService);

const cutoffTs = Date.UTC(2026, 9, 8, 12, 0, 0) / 1000;
const ramesh = PERSONAS.RAMESH;
const consent = consentService.createConsent({
  accountId: ramesh.accountId,
  durationSeconds: 3600,
  toTimestamp: cutoffTs,
});

const walletAddress = '0x111111cf1046e68e36E1aA2E0E07105eDDD1f08E';
const expectedPassportId = 101;
const sourceDirectoryVersion = 1;

const res = attestationService.attestWorkerEvidence({
  consentId: consent.consentId,
  workerWalletAddress: walletAddress,
  workerIdentityNullifier: ramesh.identityNullifierHash,
  expectedPassportId,
  sourceDirectoryVersion,
  cutoffTimestamp: cutoffTs,
});

const holderField = addressToFieldElement(walletAddress);
const providerField = providerIdToFieldElement(res.evidenceProviderId);
const dataHashField = hashToFieldElement(res.evidenceDataHash);

const fixture = {
  description: 'GigVault Proposed Gate 1 Private Snapshot Fixture (Ramesh Kumar - Swiggy Hero)',
  status: 'PROPOSED / REVIEW - Awaiting Backend B joint sign-off',
  modulus: BN254_SCALAR_FIELD_MODULUS.toString(),
  passportId: expectedPassportId.toString(),
  holderWalletAddress: walletAddress.toLowerCase(),
  holderBindingDecimal: holderField.toString(),
  evidenceProviderCanonicalId: res.evidenceProviderId,
  evidenceProviderFieldDecimal: providerField.toString(),
  evidenceDataHashHex: res.evidenceDataHash,
  evidenceDataHashFieldDecimal: dataHashField.toString(),
  verifiedHistoryStartDateDays: res.verifiedHistoryStartDate.toString(),
  evidenceUpdatedAtSeconds: res.evidenceUpdatedAt.toString(),
  sourceDirectoryVersion: sourceDirectoryVersion.toString(),
  monthlyGigIncomeTotalsPaise: res.monthlyGigIncomeTotals.map(String),
  monthlyActivityFlags: res.monthlyActivity.map(String),
  weeklyActivityFlags: res.weeklyActivity.map(String),
  proposedMetadataSlots: {
    M0_passportId: expectedPassportId.toString(),
    M1_holderBinding: holderField.toString(),
    M2_evidenceProviderId: providerField.toString(),
    M3_evidenceDataHash: dataHashField.toString(),
    M4_verifiedHistoryStartDate: res.verifiedHistoryStartDate.toString(),
    M5_evidenceUpdatedAt: res.evidenceUpdatedAt.toString(),
    M6_sourceDirectoryVersion: sourceDirectoryVersion.toString(),
    M7_incomeRoot: 'PENDING_BACKEND_B_POSEIDON_COORDINATION',
    M8_weeklyRoot: 'PENDING_BACKEND_B_POSEIDON_COORDINATION',
    M9_monthlyRoot: 'PENDING_BACKEND_B_POSEIDON_COORDINATION',
  },
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, '../../shared/proposal/typed-snapshot-fixture.json');
fs.writeFileSync(outputPath, JSON.stringify(fixture, null, 2));
console.log(`Fixture written successfully to ${outputPath}`);
