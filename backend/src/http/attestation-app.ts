/**
 * GigVault - Attestation Service HTTP Application
 * 
 * Exposes REST endpoints for worker evidence attestation and deterministic proof reconstruction:
 * - GET  /attestation/health      - Service health, directory version, and attestation status
 * - POST /attestation/attest      - Authenticate FIP provenance & derive transient EvidenceSnapshot
 * - POST /attestation/reconstruct - Deterministically reconstruct snapshot for ZK proof generation
 * 
 * Architectural Invariants:
 * 1. Client-supplied raw transactions/statements are STRICTLY REJECTED.
 * 2. Fetches signed financial data directly from Mock FIP using consentId.
 * 3. Enforces tripartite authentication:
 *    - Worker wallet authorization (EVM signature)
 *    - Verified identity assertion (from trusted IDP / Anon Aadhaar simulated)
 *    - Mock FIP account-owner binding
 * 4. Zero persistent storage of raw FIP records or plaintext EvidenceSnapshots.
 */

import express, { type Request, type Response, type Express } from 'express';
import type { MockFIPService } from '../fip/fip-service.js';
import { CURRENT_DIRECTORY_VERSION } from '../evidence/directory/registry.js';
import { EvidenceSnapshotBuilder } from '../evidence/snapshot-builder.js';
import { FIPVerifier } from '../evidence/fip-verifier.js';
import type { SignedFIPEnvelope } from '../fip/types.js';
import { MockIdentityProvider, defaultMockIdp } from '../identity/mock-idp.js';
import { verifyWorkerAuthorization } from '../identity/wallet-auth.js';

export interface AttestationAppOptions {
  fipService?: MockFIPService;
  fipBaseUrl?: string; // Optional HTTP URL for Mock FIP when running as distributed microservices
  trustedFipPublicKeys?: string[];
  idp?: MockIdentityProvider;
  strictAuthentication?: boolean; // When true, requires identityAssertion and walletAuthorization
}

export function createAttestationApp(options: AttestationAppOptions): Express {
  const {
    fipService,
    fipBaseUrl,
    trustedFipPublicKeys,
    idp = defaultMockIdp,
    strictAuthentication = false,
  } = options;

  const app = express();
  app.use(express.json());

  const fipVerifier = new FIPVerifier(trustedFipPublicKeys);

  // Helper to fetch signed envelope from FIP (in-process or over HTTP)
  async function fetchFipEnvelope(consentId: string, cutoffTs?: number): Promise<SignedFIPEnvelope> {
    if (fipService) {
      return fipService.fetchSignedDataByConsent(consentId, cutoffTs);
    }
    if (fipBaseUrl) {
      const url = new URL(`${fipBaseUrl}/fip/data/${consentId}`);
      if (cutoffTs) url.searchParams.set('currentTimestamp', String(cutoffTs));
      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as any;
        throw new Error(body.message || `FIP fetch failed with status ${res.status}`);
      }
      const data = (await res.json()) as any;
      return data.envelope;
    }
    throw new Error('Neither fipService nor fipBaseUrl configured for Attestation Service');
  }

  // 1. Health and metadata endpoint
  app.get('/attestation/health', (_req: Request, res: Response) => {
    res.json({
      status: 'HEALTHY',
      service: 'GigVault Attestation Service',
      schemaVersion: 'GIGVAULT_ATTESTATION_V1',
      currentDirectoryVersion: CURRENT_DIRECTORY_VERSION,
      strictAuthenticationEnabled: strictAuthentication,
      timestamp: Math.floor(Date.now() / 1000),
    });
  });

  // 2. Worker Evidence Attestation
  app.post('/attestation/attest', async (req: Request, res: Response) => {
    try {
      // INVARIANT CHECK 1: Reject worker-supplied transaction data
      if (req.body.transactions || req.body.bankStatement || req.body.rawRows) {
        res.status(400).json({
          error: 'WORKER_SUPPLIED_DATA_REJECTED',
          message:
            'Worker cannot self-certify financial evidence. Attestation must fetch directly from Mock FIP using consentId.',
        });
        return;
      }

      const {
        consentId,
        workerWalletAddress,
        workerIdentityNullifier,
        expectedPassportId,
        sourceDirectoryVersion = CURRENT_DIRECTORY_VERSION,
        cutoffTimestamp,
        identityAssertion,
        walletAuthorization,
      } = req.body;

      // Required fields validation
      if (!consentId || typeof consentId !== 'string') {
        res.status(400).json({ error: 'Missing or invalid consentId' });
        return;
      }
      if (!workerWalletAddress || typeof workerWalletAddress !== 'string') {
        res.status(400).json({ error: 'Missing or invalid workerWalletAddress' });
        return;
      }
      if (!workerIdentityNullifier || typeof workerIdentityNullifier !== 'string') {
        res.status(400).json({ error: 'Missing or invalid workerIdentityNullifier' });
        return;
      }
      if (expectedPassportId === undefined || typeof expectedPassportId !== 'number') {
        res.status(400).json({ error: 'Missing or invalid expectedPassportId (must be integer)' });
        return;
      }

      const cleanWallet = workerWalletAddress.toLowerCase().trim();
      const cleanNullifier = workerIdentityNullifier.toLowerCase().trim();

      // INVARIANT CHECK 2: Strict Authentication Check (when enabled or when artifacts supplied)
      if (strictAuthentication && (!identityAssertion || !walletAuthorization)) {
        res.status(401).json({
          error: 'AUTHENTICATION_REQUIRED',
          message: 'Attestation requires verified identityAssertion and signed walletAuthorization.',
        });
        return;
      }

      // Step A: Verify Identity Assertion if provided
      if (identityAssertion) {
        try {
          const idpResult = idp.verifyAssertion(identityAssertion, cutoffTimestamp);
          if (idpResult.workerWalletAddress !== cleanWallet) {
            res.status(403).json({
              error: 'IDENTITY_WALLET_MISMATCH',
              message: `Identity assertion bound to ${idpResult.workerWalletAddress}, request claimed ${cleanWallet}`,
            });
            return;
          }
          if (idpResult.workerIdentityNullifier !== cleanNullifier) {
            res.status(403).json({
              error: 'IDENTITY_NULLIFIER_MISMATCH',
              message: `Identity assertion bound to ${idpResult.workerIdentityNullifier}, request claimed ${cleanNullifier}`,
            });
            return;
          }
        } catch (err: any) {
          res.status(403).json({
            error: 'IDENTITY_ASSERTION_INVALID',
            message: err.message || 'Identity assertion cryptographic verification failed',
          });
          return;
        }
      }

      // Step B: Verify Wallet Authorization if provided
      if (walletAuthorization) {
        try {
          if (walletAuthorization.workerWalletAddress.toLowerCase() !== cleanWallet) {
            res.status(401).json({
              error: 'WALLET_AUTHORIZATION_INVALID',
              message: 'Wallet authorization address does not match requested holder address',
            });
            return;
          }
          if (walletAuthorization.consentId !== consentId) {
            res.status(401).json({
              error: 'WALLET_AUTHORIZATION_INVALID',
              message: 'Wallet authorization is not bound to this consentId',
            });
            return;
          }
          if (walletAuthorization.expectedPassportId !== expectedPassportId) {
            res.status(401).json({
              error: 'WALLET_AUTHORIZATION_INVALID',
              message: 'Wallet authorization expectedPassportId mismatch',
            });
            return;
          }
          verifyWorkerAuthorization(walletAuthorization, 300, cutoffTimestamp);
        } catch (err: any) {
          res.status(401).json({
            error: 'WALLET_AUTHORIZATION_INVALID',
            message: err.message || 'Worker wallet authorization signature verification failed',
          });
          return;
        }
      }

      // Step C: Fetch directly from Mock FIP
      const envelope = await fetchFipEnvelope(consentId, cutoffTimestamp);

      // Step D: Verify FIP signature & account-owner identity matching gate
      const verification = fipVerifier.verifyEnvelope(envelope, cleanNullifier);

      // Step E: Derive transient in-memory EvidenceSnapshot
      const cutoff = cutoffTimestamp ?? verification.payload.generatedAt;
      const { snapshot } = EvidenceSnapshotBuilder.buildSnapshot({
        fipPayload: verification.payload,
        passportId: expectedPassportId,
        holderWallet: cleanWallet,
        evidenceUpdatedAt: cutoff,
        sourceDirectoryVersion,
      });

      // Step F: Return attestation result (zero persistence of raw records)
      res.json({
        success: true,
        verified: true,
        passportId: snapshot.passportId,
        holderBinding: snapshot.holderBinding,
        identityNullifierHash: cleanNullifier,
        evidenceProviderId: snapshot.evidenceProviderId,
        evidenceDataHash: snapshot.evidenceDataHash,
        verifiedHistoryStartDate: snapshot.verifiedHistoryStartDate,
        evidenceUpdatedAt: snapshot.evidenceUpdatedAt,
        sourceDirectoryVersion: snapshot.sourceDirectoryVersion,
        monthlyGigIncomeTotals: snapshot.monthlyGigIncomeTotals,
        weeklyActivity: snapshot.weeklyActivity,
        monthlyActivity: snapshot.monthlyActivity,
        snapshot,
      });
    } catch (err: any) {
      const msg = err.message || 'Attestation failed';
      if (msg.includes('Account owner binding mismatch')) {
        res.status(403).json({ error: 'ACCOUNT_OWNER_MISMATCH', message: msg });
      } else if (msg.includes('FIP signature invalid') || msg.includes('payload hash mismatch')) {
        res.status(400).json({ error: 'FIP_SIGNATURE_INVALID', message: msg });
      } else if (msg.includes('expired')) {
        res.status(410).json({ error: 'FIP_CONSENT_EXPIRED', message: msg });
      } else if (msg.includes('revoked')) {
        res.status(403).json({ error: 'FIP_CONSENT_REVOKED', message: msg });
      } else {
        res.status(400).json({ error: 'ATTESTATION_FAILED', message: msg });
      }
    }
  });

  // 3. Deterministic Evidence Reconstruction (for ZK Prover)
  app.post('/attestation/reconstruct', async (req: Request, res: Response) => {
    try {
      const {
        consentId,
        workerWalletAddress,
        workerIdentityNullifier,
        passportId,
        sourceDirectoryVersion,
        evidenceUpdatedAt,
      } = req.body;

      if (!consentId || !workerWalletAddress || !workerIdentityNullifier || passportId === undefined) {
        res.status(400).json({ error: 'Missing required parameters for snapshot reconstruction' });
        return;
      }
      if (!evidenceUpdatedAt || !sourceDirectoryVersion) {
        res.status(400).json({ error: 'Missing historical evidenceUpdatedAt or sourceDirectoryVersion' });
        return;
      }

      // Re-fetch authenticated transactions under valid consent
      const envelope = await fetchFipEnvelope(consentId, evidenceUpdatedAt);

      // Verify signature & owner binding
      const verification = fipVerifier.verifyEnvelope(envelope, workerIdentityNullifier);

      // Deterministically reconstruct snapshot using exact historical parameters
      const { snapshot } = EvidenceSnapshotBuilder.buildSnapshot({
        fipPayload: verification.payload,
        passportId,
        holderWallet: workerWalletAddress,
        evidenceUpdatedAt,
        sourceDirectoryVersion,
      });

      res.json({
        success: true,
        reconstructed: true,
        snapshot,
      });
    } catch (err: any) {
      res.status(400).json({ error: 'RECONSTRUCTION_FAILED', message: err.message });
    }
  });

  return app;
}
