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
import { defaultFipStorage, MockFIPStorage } from '../fip/storage.js';
import { ConsentService } from '../fip/consent-service.js';
import { MockFIPService } from '../fip/fip-service.js';
import { defaultMockIdp, type MockIdentityProvider } from '../identity/mock-idp.js';
import type { ReplayProtectionRegistry } from '../identity/wallet-auth.js';

export interface UnifiedAppOptions {
  storage?: MockFIPStorage;
  consentService?: ConsentService;
  fipService?: MockFIPService;
  idp?: MockIdentityProvider;
  strictAuthentication?: boolean;
  replayRegistry?: ReplayProtectionRegistry;
  expectedChainId?: number;
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
  });
  app.use('/', attestationApp);

  return app;
}
