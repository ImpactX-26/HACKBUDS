/**
 * GigVault - Unified Backend A HTTP Application
 * 
 * Mounts both Mock FIP and GigVault Attestation applications under explicit namespaces:
 * - /fip/*        -> Mock Bank / FIP Authority
 * - /attestation/* -> GigVault Attestation Authority
 */

import express, { type Express } from 'express';
import { createFipApp } from './fip-app.js';
import { createAttestationApp } from './attestation-app.js';
import { createOnboardingApp } from './onboarding-app.js';
import { defaultFipStorage, MockFIPStorage } from '../fip/storage.js';
import { ConsentService } from '../fip/consent-service.js';
import { MockFIPService } from '../fip/fip-service.js';
import { defaultMockIdp, type MockIdentityProvider } from '../identity/mock-idp.js';
import type { ReplayProtectionRegistry } from '../identity/wallet-auth.js';
import type { IEvidenceCommitmentAdapter } from '../evidence/commitment-adapter.js';
import type { IGigPassportClient } from '../evidence/passport-client.js';
import type { ITrustedProverAdapter } from '../evidence/prover-boundary.js';
import type { AttestationService } from '../evidence/attestation-service.js';
import { OnboardingSessionService } from '../identity/onboarding/session-service.js';
import { MockPhoneVerificationProvider } from '../identity/phone/mock-provider.js';
import { MockAadhaarVerifier } from '../identity/aadhaar/mock-verifier.js';
import type { IPhoneVerificationProvider } from '../identity/phone/types.js';

export interface UnifiedAppOptions {
  storage?: MockFIPStorage;
  consentService?: ConsentService;
  fipService?: MockFIPService;
  idp?: MockIdentityProvider;
  strictAuthentication?: boolean;
  replayRegistry?: ReplayProtectionRegistry;
  expectedChainId?: number;
  commitmentAdapter?: IEvidenceCommitmentAdapter;
  passportContract?: IGigPassportClient;
  proverAdapter?: ITrustedProverAdapter;
  attestationService?: AttestationService;
  adminApiKey?: string;
  onboardingService?: OnboardingSessionService;
  phoneProvider?: IPhoneVerificationProvider;
  allowDevTestRetrieval?: boolean;
}

export function createUnifiedApp(options: UnifiedAppOptions = {}): Express {
  const storage = options.storage || defaultFipStorage;
  const idp = options.idp || defaultMockIdp;
  const consentService = options.consentService || new ConsentService(storage, idp);
  const fipService = options.fipService || new MockFIPService(storage, consentService, undefined, idp);

  const app = express();
  app.use(express.json());

  // Mount FIP app
  const fipApp = createFipApp({
    storage,
    consentService,
    fipService,
    strictAuthentication: options.strictAuthentication ?? true,
  });
  app.use('/', fipApp);

  // Mount Attestation app (using in-process direct FIP service for speed and reliability)
  const attestationApp = createAttestationApp({
    fipService,
    trustedFipPublicKeys: [storage.getPublicKeyPem()],
    idp: options.idp,
    strictAuthentication: options.strictAuthentication ?? true,
    replayRegistry: options.replayRegistry,
    expectedChainId: options.expectedChainId,
    commitmentAdapter: options.commitmentAdapter,
    passportContract: options.passportContract,
    proverAdapter: options.proverAdapter,
    attestationService: options.attestationService,
    adminApiKey: options.adminApiKey,
  });
  app.use('/', attestationApp);

  // Mount Onboarding app
  const phoneProvider =
    options.phoneProvider ||
    new MockPhoneVerificationProvider({ allowDevTestRetrieval: options.allowDevTestRetrieval ?? false });
  const onboardingService =
    options.onboardingService ||
    new OnboardingSessionService({
      phoneProvider,
      mockAadhaarVerifier: new MockAadhaarVerifier(idp),
    });
  const onboardingApp = createOnboardingApp({
    onboardingService,
    allowDevTestRetrieval: options.allowDevTestRetrieval,
  });
  app.use('/', onboardingApp);

  return app;
}
