/**
 * GigVault - Mock Aadhaar Verifier (Mode B: Synthetic Personas)
 * 
 * Verifies cryptographically signed identity assertions issued by the trusted
 * Mock Identity Provider for synthetic hackathon personas.
 * 
 * Architectural Notice:
 * This verifier is strictly isolated to SYNTHETIC_MOCK_IDP mode.
 * It will NEVER accept or simulate real Anon Aadhaar proofs, and will
 * fail closed if invoked with REAL_ANON_AADHAAR mode.
 */

import { MockIdentityProvider, defaultMockIdp } from '../mock-idp.js';
import { PERSONAS } from '../../fip/personas/persona-types.js';
import {
  type IAadhaarProofVerifier,
  type VerifyAadhaarRequest,
  type VerifyAadhaarResult,
  AadhaarTrustMode,
  AadhaarTrustModeMismatchError,
  MockAadhaarAssertionInvalidError,
} from './types.js';

export class MockAadhaarVerifier implements IAadhaarProofVerifier {
  private idp: MockIdentityProvider;

  constructor(idp: MockIdentityProvider = defaultMockIdp) {
    this.idp = idp;
  }

  public getTrustMode(): AadhaarTrustMode {
    return 'SYNTHETIC_MOCK_IDP';
  }

  public async verify(request: VerifyAadhaarRequest): Promise<VerifyAadhaarResult> {
    // 1. Strict mode separation: Reject if request is for real Anon Aadhaar
    if (request.mode !== 'SYNTHETIC_MOCK_IDP') {
      throw new AadhaarTrustModeMismatchError('SYNTHETIC_MOCK_IDP', request.mode);
    }

    const payload = request.mockAssertionPayload;
    if (!payload || !payload.assertion) {
      throw new MockAadhaarAssertionInvalidError('Missing mockAssertionPayload in request');
    }

    const assertion = payload.assertion;

    // 2. Validate wallet address binding
    const assertionWallet = (assertion.workerWalletAddress || '').toLowerCase().trim();
    const expectedWallet = (request.expectedWalletAddress || '').toLowerCase().trim();

    if (!assertionWallet || !expectedWallet || assertionWallet !== expectedWallet) {
      throw new MockAadhaarAssertionInvalidError(
        `Wallet binding mismatch: assertion wallet ${assertionWallet} does not match expected session wallet ${expectedWallet}`
      );
    }

    // 3. Verify cryptographic secp256k1 signature and expiry using trusted Mock IDP
    try {
      const idpResult = this.idp.verifyAssertion(assertion);
      if (!idpResult.valid) {
        throw new MockAadhaarAssertionInvalidError('Mock IDP assertion signature verification returned false');
      }
    } catch (err) {
      throw new MockAadhaarAssertionInvalidError(
        `Mock IDP verification failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // 4. Resolve synthetic persona worker ID if mapped
    const nullifierClean = assertion.workerIdentityNullifier.toLowerCase().trim();
    let matchedWorkerId: string | undefined;

    for (const [key, persona] of Object.entries(PERSONAS)) {
      if (persona.identityNullifierHash.toLowerCase().trim() === nullifierClean) {
        matchedWorkerId = persona.id;
        break;
      }
    }

    return {
      valid: true,
      mode: 'SYNTHETIC_MOCK_IDP',
      identityNullifier: assertion.workerIdentityNullifier,
      workerId: matchedWorkerId,
      verifiedAt: Date.now(),
    };
  }
}
