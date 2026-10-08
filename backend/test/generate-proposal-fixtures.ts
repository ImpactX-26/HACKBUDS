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
import { MockIdentityProvider } from '../src/identity/mock-idp.js';
import { signWorkerAuthorization } from '../src/identity/wallet-auth.js';
import { ethers } from 'ethers';

const storage = new MockFIPStorage();
const consentService = new ConsentService(storage);
const fipService = new MockFIPService(storage, consentService);
const idp = new MockIdentityProvider();
const attestationService = new AttestationService(
  fipService,
  [storage.getPublicKeyPem()],
  idp
);

const cutoffTs = Date.UTC(2026, 9, 8, 12, 0, 0) / 1000;
const ramesh = PERSONAS.RAMESH;
const consent = consentService.createConsent({
  accountId: ramesh.accountId,
  authorizedIdentityNullifier: ramesh.identityNullifierHash,
  durationSeconds: 3600,
  toTimestamp: cutoffTs,
});

const wallet = ethers.Wallet.createRandom();
const walletAddress = wallet.address;
const expectedPassportId = 101;
const sourceDirectoryVersion = 1;

const assertion = idp.issueAssertion({
  workerIdentityNullifier: ramesh.identityNullifierHash,
  workerWalletAddress: walletAddress,
  durationSeconds: 3600,
});

const auth = await signWorkerAuthorization({
  action: 'MINT_PASSPORT',
  workerWalletAddress: walletAddress,
  consentId: consent.consentId,
  expectedPassportId,
}, wallet);

const res = attestationService.attestWorkerEvidence({
  consentId: consent.consentId,
  workerWalletAddress: walletAddress,
  workerIdentityNullifier: ramesh.identityNullifierHash,
  expectedPassportId,
  sourceDirectoryVersion,
  cutoffTimestamp: cutoffTs,
  identityAssertion: assertion,
  walletAuthorization: auth,
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
