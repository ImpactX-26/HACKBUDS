/**
 * GigVault - Onboarding to Attestation Adapter
 * 
 * Bridges a committed onboarding identity to the downstream GigVault
 * attestation pipeline and FIP consent workflow.
 * 
 * Non-negotiable Architectural Boundaries:
 * 1. Preserves existing tripartite authentication (Wallet, Identity, Bank Account).
 * 2. Mode isolation: Real Anon Aadhaar identities CANNOT claim synthetic persona bank
 *    accounts without an authenticated UIDAI/FIP KYC mapping.
 * 3. Synthetic Mock identities can seamlessly connect to corresponding synthetic personas.
 * 4. Fails closed if downstream authority does not support the identity mode.
 */

import type { WorkerOnboardingRecord } from './types.js';
import type { MockIdentityProvider } from '../mock-idp.js';
import type { ConsentService } from '../../fip/consent-service.js';
import type { AttestationService } from '../../evidence/attestation-service.js';
import { PERSONAS } from '../../fip/personas/persona-types.js';

export class UnsupportedIdentityBridgeError extends Error {
  constructor(message: string) {
    super(`UnsupportedIdentityBridge: ${message}`);
    this.name = 'UnsupportedIdentityBridgeError';
  }
}

export class OnboardingAttestationAdapter {
  private idp: MockIdentityProvider;
  private consentService?: ConsentService;
  private attestationService?: AttestationService;

  constructor(options: {
    idp: MockIdentityProvider;
    consentService?: ConsentService;
    attestationService?: AttestationService;
  }) {
    this.idp = options.idp;
    this.consentService = options.consentService;
    this.attestationService = options.attestationService;
  }

  /**
   * For synthetic workers, issues an identity assertion for the committed record.
   * Fails closed for real Anon Aadhaar until downstream real banking bridge is configured.
   */
  public createAssertionForCommittedWorker(record: WorkerOnboardingRecord) {
    if (record.status !== 'ACTIVE') {
      throw new Error(`Worker ${record.workerId} is REVOKED and cannot authorize attestation`);
    }

    if (record.identityTrustMode === 'SYNTHETIC_MOCK_IDP') {
      return this.idp.issueAssertion({
        workerIdentityNullifier: record.identityNullifier,
        workerWalletAddress: record.walletAddress,
        durationSeconds: 86400,
      });
    }

    if (record.identityTrustMode === 'REAL_ANON_AADHAAR') {
      throw new UnsupportedIdentityBridgeError(
        'Real Anon Aadhaar identity cannot access synthetic mock bank accounts. A production FIP with Aadhaar e-KYC account binding is required.'
      );
    }

    throw new UnsupportedIdentityBridgeError(`Unknown identity trust mode: ${record.identityTrustMode}`);
  }

  /**
   * Resolve synthetic persona metadata if available.
   */
  public getPersonaMetadata(record: WorkerOnboardingRecord) {
    if (record.identityTrustMode !== 'SYNTHETIC_MOCK_IDP') {
      return null;
    }
    const clean = record.identityNullifier.toLowerCase().trim();
    for (const persona of Object.values(PERSONAS)) {
      if (persona.identityNullifierHash.toLowerCase().trim() === clean) {
        return persona;
      }
    }
    return null;
  }
}
