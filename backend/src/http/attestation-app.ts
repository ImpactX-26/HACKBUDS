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
 * 3. Enforces FIP signature validity and bank account-owner identity nullifier matching.
 * 4. Zero persistent storage of raw FIP records or plaintext EvidenceSnapshots.
 */

import express, { type Request, type Response, type Express } from 'express';
import { AttestationService } from '../evidence/attestation-service.js';
import type { MockFIPService } from '../fip/fip-service.js';
import { CURRENT_DIRECTORY_VERSION } from '../evidence/directory/registry.js';
import { EvidenceSnapshotBuilder } from '../evidence/snapshot-builder.js';
import { FIPVerifier } from '../evidence/fip-verifier.js';
import type { SignedFIPEnvelope } from '../fip/types.js';

export interface AttestationAppOptions {
  fipService?: MockFIPService;
  fipBaseUrl?: string; // Optional HTTP URL for Mock FIP when running as distributed microservices
  trustedFipPublicKeys?: string[];
}

export function createAttestationApp(options: AttestationAppOptions): Express {
  const { fipService, fipBaseUrl, trustedFipPublicKeys } = options;
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
      timestamp: Math.floor(Date.now() / 1000),
    });
  });

  // 2. Worker Evidence Attestation
  app.post('/attestation/attest', async (req: Request, res: Response) => {
    try {
      // INVARIANT CHECK: Reject worker-supplied transaction data
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

      // Step A: Fetch directly from Mock FIP
      const envelope = await fetchFipEnvelope(consentId, cutoffTimestamp);

      // Step B: Verify FIP signature & account-owner identity matching gate
      const verification = fipVerifier.verifyEnvelope(envelope, workerIdentityNullifier);

      // Step C: Derive transient in-memory EvidenceSnapshot
      const cutoff = cutoffTimestamp ?? verification.payload.generatedAt;
      const { snapshot } = EvidenceSnapshotBuilder.buildSnapshot({
        fipPayload: verification.payload,
        passportId: expectedPassportId,
        holderWallet: workerWalletAddress,
        evidenceUpdatedAt: cutoff,
        sourceDirectoryVersion,
      });

      // Step D: Return attestation result (zero persistence of raw records)
      res.json({
        success: true,
        verified: true,
        passportId: snapshot.passportId,
        holderBinding: snapshot.holderBinding,
        identityNullifierHash: workerIdentityNullifier,
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
