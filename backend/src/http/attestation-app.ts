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
import { CURRENT_DIRECTORY_VERSION, getDirectoryForVersion } from '../evidence/directory/registry.js';
import { EvidenceSnapshotBuilder } from '../evidence/snapshot-builder.js';
import { FIPVerifier } from '../evidence/fip-verifier.js';
import type { SignedFIPEnvelope } from '../fip/types.js';
import { MockIdentityProvider, defaultMockIdp } from '../identity/mock-idp.js';
import { verifyWorkerAuthorization, ReplayProtectionRegistry, defaultReplayRegistry } from '../identity/wallet-auth.js';
import {
  type IGigPassportClient,
  LiveAdapterNotConfiguredError,
  LiveSubmissionProhibitedError,
  ExpectedIdMismatchError,
  ActivePassportExistsError,
  ReissueNotAuthorizedError,
  PassportNotActiveError,
  CommitmentUnchangedError,
  EvidenceTimestampRegressedError,
} from '../evidence/passport-client.js';
import {
  type IEvidenceCommitmentAdapter,
  defaultCommitmentAdapter,
} from '../evidence/commitment-adapter.js';
import {
  type ITrustedProverAdapter,
  defaultProverAdapter,
} from '../evidence/prover-boundary.js';
import { AttestationService } from '../evidence/attestation-service.js';
import crypto from 'node:crypto';

export interface AttestationAppOptions {
  fipService?: MockFIPService;
  fipBaseUrl?: string; // Optional HTTP URL for Mock FIP when running as distributed microservices
  trustedFipPublicKeys?: string[];
  idp?: MockIdentityProvider;
  strictAuthentication?: boolean; // When true, requires identityAssertion and walletAuthorization
  replayRegistry?: ReplayProtectionRegistry;
  expectedChainId?: number;
  commitmentAdapter?: IEvidenceCommitmentAdapter;
  passportContract?: IGigPassportClient;
  proverAdapter?: ITrustedProverAdapter;
  attestationService?: AttestationService;
  adminApiKey?: string;
}

export function createAttestationApp(options: AttestationAppOptions): Express {
  const {
    fipService,
    fipBaseUrl,
    trustedFipPublicKeys,
    idp = defaultMockIdp,
    strictAuthentication = true, // FAIL-CLOSED DEFAULT: Mandatory worker authentication
    replayRegistry = defaultReplayRegistry,
    expectedChainId,
    commitmentAdapter = defaultCommitmentAdapter,
    passportContract = options.passportContract,
    proverAdapter = defaultProverAdapter,
    adminApiKey = options.adminApiKey,
  } = options;

  const attestationService =
    options.attestationService ||
    (fipService
      ? new AttestationService(
          fipService,
          trustedFipPublicKeys,
          idp,
          replayRegistry,
          expectedChainId,
          commitmentAdapter,
          passportContract
        )
      : undefined);

  const app = express();
  app.use(express.json());

  const fipVerifier = new FIPVerifier(trustedFipPublicKeys);

  // Helper to fetch signed envelope from FIP (in-process or over HTTP)
  async function fetchFipEnvelope(
    consentId: string,
    cutoffTs?: number,
    auth?: { identityAssertion?: any; walletAuthorization?: any }
  ): Promise<SignedFIPEnvelope> {
    if (fipService) {
      return fipService.fetchSignedDataByConsent(consentId, cutoffTs, undefined, auth);
    }
    if (fipBaseUrl) {
      const url = new URL(`${fipBaseUrl}/fip/data/${consentId}`);
      if (cutoffTs) url.searchParams.set('cutoffTimestamp', String(cutoffTs));
      const headers: Record<string, string> = {};
      if (auth?.identityAssertion) {
        headers['x-identity-assertion'] = JSON.stringify(auth.identityAssertion);
      }
      if (auth?.walletAuthorization) {
        headers['x-wallet-authorization'] = JSON.stringify(auth.walletAuthorization);
      }
      const res = await fetch(url.toString(), { headers });
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
      if (expectedPassportId === undefined || typeof expectedPassportId !== 'number' || !Number.isSafeInteger(expectedPassportId) || expectedPassportId < 0) {
        res.status(400).json({ error: 'Missing or invalid expectedPassportId (must be non-negative integer)' });
        return;
      }
      if (cutoffTimestamp !== undefined && (typeof cutoffTimestamp !== 'number' || !Number.isSafeInteger(cutoffTimestamp) || cutoffTimestamp <= 0)) {
        res.status(400).json({ error: 'Missing or invalid cutoffTimestamp (must be positive integer)' });
        return;
      }
      try {
        getDirectoryForVersion(sourceDirectoryVersion);
      } catch (err: any) {
        res.status(400).json({ error: 'UNPUBLISHED_DIRECTORY_VERSION', message: err.message });
        return;
      }

      const cleanWallet = workerWalletAddress.toLowerCase().trim();
      const cleanNullifier = workerIdentityNullifier.toLowerCase().trim();

      // INVARIANT CHECK 2: Mandatory Authentication Check (fail closed)
      if (strictAuthentication && (!identityAssertion || !walletAuthorization)) {
        res.status(401).json({
          error: 'AUTHENTICATION_REQUIRED',
          message: 'Attestation requires verified identityAssertion and signed walletAuthorization.',
        });
        return;
      }

      // Step A: Verify Identity Assertion
      if (identityAssertion) {
        try {
          // Trusted server clock check (NEVER client-supplied cutoffTimestamp!)
          const idpResult = idp.verifyAssertion(identityAssertion);
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

      // Step B: Verify Wallet Authorization
      if (walletAuthorization) {
        try {
          const allowedActions = ['MINT_PASSPORT', 'REFRESH_PASSPORT', 'REISSUE_PASSPORT'];
          if (!allowedActions.includes(walletAuthorization.action)) {
            res.status(400).json({
              error: 'UNAUTHORIZED_WORKER_ACTION',
              message: `Action ${walletAuthorization.action} is not permitted for attestation (allowed: ${allowedActions.join(', ')})`,
            });
            return;
          }
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
          if (expectedChainId !== undefined) {
            if (walletAuthorization.chainId === undefined) {
              res.status(400).json({
                error: 'CHAIN_DOMAIN_MISSING',
                message: `Wallet authorization must specify chainId matching expected chain ${expectedChainId}`,
              });
              return;
            }
            if (walletAuthorization.chainId !== expectedChainId) {
              res.status(400).json({
                error: 'CHAIN_DOMAIN_MISMATCH',
                message: `Wallet authorization chainId ${walletAuthorization.chainId} does not match expected chainId ${expectedChainId}`,
              });
              return;
            }
          }
          // Freshness against trusted server clock
          verifyWorkerAuthorization(walletAuthorization, 300);

          // Atomic Replay Protection Check & Consume
          try {
            replayRegistry.consume(walletAuthorization);
          } catch (replayErr: any) {
            res.status(409).json({
              error: 'REPLAY_ATTACK_DETECTED',
              message: replayErr.message || 'Worker authorization signature or nonce has already been consumed',
            });
            return;
          }
        } catch (err: any) {
          res.status(401).json({
            error: 'WALLET_AUTHORIZATION_INVALID',
            message: err.message || 'Worker wallet authorization signature verification failed',
          });
          return;
        }
      }

      // Step C: Fetch directly from Mock FIP
      const envelope = await fetchFipEnvelope(consentId, cutoffTimestamp, { identityAssertion, walletAuthorization });

      // Step D: Verify FIP signature & account-owner identity matching gate (fail closed)
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

      if (commitmentAdapter) {
        const commRes = await commitmentAdapter.computeCommitment(snapshot);
        snapshot.evidenceCommitment = commRes.evidenceCommitment;
      }

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
      if (msg.includes('Account owner binding mismatch') || msg.includes('UnauthorizedFIPRetrieval')) {
        res.status(403).json({ error: 'ACCOUNT_OWNER_MISMATCH', message: msg });
      } else if (msg.includes('FIP signature invalid') || msg.includes('payload hash mismatch') || msg.includes('Untrusted FIP public key')) {
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

  // 3. Deterministic Evidence Reconstruction (for authorized ZK Prover)
  app.post('/attestation/reconstruct', async (req: Request, res: Response) => {
    try {
      const {
        consentId,
        workerWalletAddress,
        workerIdentityNullifier,
        passportId,
        sourceDirectoryVersion,
        evidenceUpdatedAt,
        identityAssertion,
        walletAuthorization,
      } = req.body;

      if (!consentId || !workerWalletAddress || !workerIdentityNullifier || passportId === undefined) {
        res.status(400).json({ error: 'Missing required parameters for snapshot reconstruction' });
        return;
      }
      if (typeof passportId !== 'number' || !Number.isSafeInteger(passportId) || passportId < 0) {
        res.status(400).json({ error: 'Invalid passportId: must be non-negative integer' });
        return;
      }
      if (typeof evidenceUpdatedAt !== 'number' || !Number.isSafeInteger(evidenceUpdatedAt) || evidenceUpdatedAt <= 0) {
        res.status(400).json({ error: 'Invalid evidenceUpdatedAt: must be positive integer Unix timestamp' });
        return;
      }
      try {
        getDirectoryForVersion(sourceDirectoryVersion);
      } catch (err: any) {
        res.status(400).json({ error: 'UNPUBLISHED_DIRECTORY_VERSION', message: err.message });
        return;
      }

      // INVARIANT CHECK: Reconstruction requires authenticated worker authorization
      if (strictAuthentication && (!identityAssertion || !walletAuthorization)) {
        res.status(401).json({
          error: 'AUTHENTICATION_REQUIRED',
          message: 'Evidence reconstruction requires verified identityAssertion and worker walletAuthorization.',
        });
        return;
      }

      const cleanWallet = workerWalletAddress.toLowerCase().trim();
      const cleanNullifier = workerIdentityNullifier.toLowerCase().trim();

      // Verify Identity Assertion if provided
      if (identityAssertion) {
        try {
          const idpResult = idp.verifyAssertion(identityAssertion);
          if (idpResult.workerWalletAddress !== cleanWallet || idpResult.workerIdentityNullifier !== cleanNullifier) {
            res.status(403).json({
              error: 'IDENTITY_MISMATCH',
              message: 'Identity assertion does not match requested worker identity or wallet',
            });
            return;
          }
        } catch (err: any) {
          res.status(403).json({
            error: 'IDENTITY_ASSERTION_INVALID',
            message: err.message || 'Identity assertion verification failed',
          });
          return;
        }
      }

      // Verify Wallet Authorization if provided
      if (walletAuthorization) {
        try {
          if (walletAuthorization.workerWalletAddress.toLowerCase() !== cleanWallet) {
            res.status(401).json({ error: 'WALLET_SIGNER_MISMATCH' });
            return;
          }
          if (walletAuthorization.action !== 'RECONSTRUCT_EVIDENCE') {
            res.status(401).json({ error: 'INVALID_ACTION', message: 'Action must be RECONSTRUCT_EVIDENCE' });
            return;
          }
          if (walletAuthorization.consentId !== consentId) {
            res.status(401).json({ error: 'CONSENT_MISMATCH' });
            return;
          }
          if (walletAuthorization.expectedPassportId !== passportId) {
            res.status(401).json({ error: 'PASSPORT_ID_MISMATCH' });
            return;
          }
          if (expectedChainId !== undefined) {
            if (walletAuthorization.chainId === undefined) {
              res.status(400).json({
                error: 'CHAIN_DOMAIN_MISSING',
                message: `Wallet authorization must specify chainId matching expected chain ${expectedChainId}`,
              });
              return;
            }
            if (walletAuthorization.chainId !== expectedChainId) {
              res.status(400).json({
                error: 'CHAIN_DOMAIN_MISMATCH',
                message: `Wallet authorization chainId ${walletAuthorization.chainId} does not match expected chainId ${expectedChainId}`,
              });
              return;
            }
          }
          verifyWorkerAuthorization(walletAuthorization, 300);

          // Atomic Replay Protection Check & Consume
          const requestFingerprint = crypto
            .createHash('sha256')
            .update(
              JSON.stringify({
                passportId,
                evidenceUpdatedAt,
                sourceDirectoryVersion,
                consentId,
                cleanWallet,
                cleanNullifier,
              }),
              'utf8'
            )
            .digest('hex');

          try {
            // CURRENT BEHAVIOR (ENFORCED): Strictly single-use (allowIdempotentReplay: false).
            // Any replayed authorization signature is rejected with HTTP 409 REPLAY_ATTACK_DETECTED.
            // PROPOSED BEHAVIOR: If joint consensus approves safe worker retry for reconstruction,
            // allowIdempotentReplay may be enabled when requestFingerprint matches.
            replayRegistry.consume(walletAuthorization, {
              requestFingerprint,
              allowIdempotentReplay: false,
            });
          } catch (replayErr: any) {
            res.status(409).json({
              error: 'REPLAY_ATTACK_DETECTED',
              message: replayErr.message || 'Worker authorization signature or nonce has already been consumed',
            });
            return;
          }
        } catch (err: any) {
          res.status(401).json({
            error: 'WALLET_AUTHORIZATION_INVALID',
            message: err.message || 'Worker wallet authorization signature verification failed',
          });
          return;
        }
      }

      // Re-fetch authenticated transactions under valid consent
      const envelope = await fetchFipEnvelope(consentId, evidenceUpdatedAt, { identityAssertion, walletAuthorization });

      // Verify signature & owner binding
      const verification = fipVerifier.verifyEnvelope(envelope, cleanNullifier);

      // Deterministically reconstruct snapshot using exact historical parameters
      const { snapshot } = EvidenceSnapshotBuilder.buildSnapshot({
        fipPayload: verification.payload,
        passportId,
        holderWallet: cleanWallet,
        evidenceUpdatedAt,
        sourceDirectoryVersion,
      });

      if (commitmentAdapter) {
        const commRes = await commitmentAdapter.computeCommitment(snapshot);
        snapshot.evidenceCommitment = commRes.evidenceCommitment;
      }

      res.json({
        success: true,
        reconstructed: true,
        snapshot,
      });
    } catch (err: any) {
      res.status(400).json({ error: 'RECONSTRUCTION_FAILED', message: err.message });
    }
  });

  // Error translation helper for attestation and contract adapter errors
  function handleAttestationError(err: any, res: Response) {
    const msg = err.message || 'Operation failed';
    if (err instanceof LiveAdapterNotConfiguredError || msg.includes('PassportContractNotConfigured')) {
      res.status(503).json({ error: 'LIVE_ADAPTER_NOT_CONFIGURED', message: msg });
    } else if (err instanceof LiveSubmissionProhibitedError || msg.includes('LiveSubmissionProhibited')) {
      res.status(400).json({ error: 'LIVE_SUBMISSION_PROHIBITED', message: msg });
    } else if (err instanceof ExpectedIdMismatchError || msg.includes('ExpectedIdMismatch')) {
      res.status(409).json({ error: 'EXPECTED_ID_MISMATCH', message: msg });
    } else if (err instanceof ActivePassportExistsError || msg.includes('ActivePassportExists')) {
      res.status(409).json({ error: 'ACTIVE_PASSPORT_EXISTS', message: msg });
    } else if (err instanceof ReissueNotAuthorizedError || msg.includes('ReissueNotAuthorized')) {
      res.status(403).json({ error: 'REISSUE_NOT_AUTHORIZED', message: msg });
    } else if (err instanceof PassportNotActiveError || msg.includes('PassportNotActive')) {
      res.status(400).json({ error: 'PASSPORT_NOT_ACTIVE', message: msg });
    } else if (err instanceof CommitmentUnchangedError || msg.includes('CommitmentUnchanged')) {
      res.status(400).json({ error: 'COMMITMENT_UNCHANGED', message: msg });
    } else if (err instanceof EvidenceTimestampRegressedError || msg.includes('EvidenceTimestampRegressed')) {
      res.status(400).json({ error: 'EVIDENCE_TIMESTAMP_REGRESSED', message: msg });
    } else if (msg.includes('Replay') || msg.includes('REPLAY_ATTACK_DETECTED')) {
      res.status(409).json({ error: 'REPLAY_ATTACK_DETECTED', message: msg });
    } else if (msg.includes('AuthenticationRequired')) {
      res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: msg });
    } else if (msg.includes('Identity assertion') || msg.includes('Account owner binding mismatch')) {
      res.status(403).json({ error: 'IDENTITY_MISMATCH', message: msg });
    } else if (msg.includes('Wallet authorization') || msg.includes('UnauthorizedWorkerAction')) {
      res.status(401).json({ error: 'WALLET_AUTHORIZATION_INVALID', message: msg });
    } else {
      res.status(400).json({ error: 'OPERATION_FAILED', message: msg });
    }
  }

  // 4. On-chain Passport Minting with Contentious Sequential ID Retry
  app.post('/attestation/mint-on-chain', async (req: Request, res: Response) => {
    try {
      if (!passportContract) {
        throw new LiveAdapterNotConfiguredError('PassportContractNotConfigured: no passport contract client configured');
      }
      if (!attestationService) {
        res.status(503).json({
          error: 'ATTESTATION_SERVICE_UNAVAILABLE',
          message: 'Attestation service not available for on-chain issuance',
        });
        return;
      }
      const result = await attestationService.attestAndMintOnChain(req.body);
      res.json({
        success: true,
        passportId: result.passportId,
        attestation: result.attestation,
        evidenceCommitment: result.attestation.snapshot.evidenceCommitment,
      });
    } catch (err: any) {
      handleAttestationError(err, res);
    }
  });

  // 5. On-chain Evidence Refresh on ACTIVE Passport
  app.post('/attestation/refresh-on-chain', async (req: Request, res: Response) => {
    try {
      if (!passportContract) {
        throw new LiveAdapterNotConfiguredError('PassportContractNotConfigured: no passport contract client configured');
      }
      if (!attestationService) {
        res.status(503).json({
          error: 'ATTESTATION_SERVICE_UNAVAILABLE',
          message: 'Attestation service not available for on-chain refresh',
        });
        return;
      }
      const passportId = req.body.passportId ?? req.body.expectedPassportId;
      if (passportId === undefined || typeof passportId !== 'number' || !Number.isSafeInteger(passportId) || passportId < 0) {
        res.status(400).json({ error: 'Missing or invalid passportId' });
        return;
      }
      const result = await attestationService.refreshPassportEvidenceOnChain(req.body, passportId);
      res.json({
        success: true,
        passportId: result.passportId,
        attestation: result.attestation,
        evidenceCommitment: result.attestation.snapshot.evidenceCommitment,
      });
    } catch (err: any) {
      handleAttestationError(err, res);
    }
  });

  // 6. On-chain Passport Reissue after Revocation
  app.post('/attestation/reissue-on-chain', async (req: Request, res: Response) => {
    try {
      if (!passportContract) {
        throw new LiveAdapterNotConfiguredError('PassportContractNotConfigured: no passport contract client configured');
      }
      if (!attestationService) {
        res.status(503).json({
          error: 'ATTESTATION_SERVICE_UNAVAILABLE',
          message: 'Attestation service not available for on-chain reissue',
        });
        return;
      }
      const result = await attestationService.reissuePassportOnChain(req.body);
      res.json({
        success: true,
        passportId: result.passportId,
        attestation: result.attestation,
        evidenceCommitment: result.attestation.snapshot.evidenceCommitment,
      });
    } catch (err: any) {
      handleAttestationError(err, res);
    }
  });

  // 7. Read Passport Record by ID
  app.get('/attestation/passport/:passportId', async (req: Request, res: Response) => {
    try {
      if (!passportContract) {
        throw new LiveAdapterNotConfiguredError('PassportContractNotConfigured: no passport contract client configured');
      }
      const passportId = Number(req.params.passportId);
      if (isNaN(passportId) || !Number.isSafeInteger(passportId) || passportId < 0) {
        res.status(400).json({ error: 'Invalid passportId parameter' });
        return;
      }
      const passport = await passportContract.getPassport(passportId);
      if (!passport) {
        res.status(404).json({ error: 'PASSPORT_NOT_FOUND', message: `Passport #${passportId} not found` });
        return;
      }
      res.json({ success: true, passport });
    } catch (err: any) {
      handleAttestationError(err, res);
    }
  });

  // 8. Private Prover Handoff Boundary
  app.post('/attestation/prover/handoff', async (req: Request, res: Response) => {
    try {
      if (!attestationService) {
        res.status(503).json({
          error: 'ATTESTATION_SERVICE_UNAVAILABLE',
          message: 'Attestation service not available for prover handoff',
        });
        return;
      }
      const result = await attestationService.handoffToProver(req.body, proverAdapter);
      res.json({
        success: true,
        handoff: result,
      });
    } catch (err: any) {
      handleAttestationError(err, res);
    }
  });

  // 9. Admin Terminal Revocation (ADMIN_ROLE)
  app.post('/attestation/admin/revoke', async (req: Request, res: Response) => {
    try {
      if (adminApiKey) {
        const authHeader = req.headers['authorization'];
        const providedKey = req.headers['x-admin-key'] || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);
        if (providedKey !== adminApiKey) {
          res.status(403).json({ error: 'ADMIN_UNAUTHORIZED', message: 'Invalid or missing admin credentials' });
          return;
        }
      }
      if (!passportContract) {
        throw new LiveAdapterNotConfiguredError('PassportContractNotConfigured: no passport contract client configured');
      }
      const { passportId, reason, adminCaller } = req.body;
      if (passportId === undefined || typeof passportId !== 'number' || !Number.isSafeInteger(passportId) || passportId < 0) {
        res.status(400).json({ error: 'Missing or invalid passportId' });
        return;
      }
      if (!reason || typeof reason !== 'string') {
        res.status(400).json({ error: 'Missing or invalid reason' });
        return;
      }
      if (attestationService) {
        await attestationService.revokePassportOnChain(passportId, reason, adminCaller);
      } else {
        await passportContract.revoke(passportId, reason, adminCaller);
      }
      res.json({ success: true, passportId, status: 'REVOKED' });
    } catch (err: any) {
      handleAttestationError(err, res);
    }
  });

  // 10. Admin Authorize Reissue (ADMIN_ROLE)
  app.post('/attestation/admin/authorize-reissue', async (req: Request, res: Response) => {
    try {
      if (adminApiKey) {
        const authHeader = req.headers['authorization'];
        const providedKey = req.headers['x-admin-key'] || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);
        if (providedKey !== adminApiKey) {
          res.status(403).json({ error: 'ADMIN_UNAUTHORIZED', message: 'Invalid or missing admin credentials' });
          return;
        }
      }
      if (!passportContract) {
        throw new LiveAdapterNotConfiguredError('PassportContractNotConfigured: no passport contract client configured');
      }
      const { identityNullifier, adminCaller } = req.body;
      if (!identityNullifier || typeof identityNullifier !== 'string') {
        res.status(400).json({ error: 'Missing or invalid identityNullifier' });
        return;
      }
      if (attestationService) {
        await attestationService.authorizeReissueOnChain(identityNullifier, adminCaller);
      } else {
        await passportContract.authorizeReissue(identityNullifier, adminCaller);
      }
      res.json({ success: true, identityNullifier, reissueAuthorized: true });
    } catch (err: any) {
      handleAttestationError(err, res);
    }
  });

  return app;
}
