/**
 * GigVault - Backend A (Mock FIP & Deterministic Evidence Pipeline)
 */

export * from './fip/types.js';
export * from './fip/crypto.js';
export * from './fip/storage.js';
export * from './fip/consent-service.js';
export * from './fip/fip-service.js';
export * from './fip/personas/index.js';

export * from './evidence/directory/types.js';
export * from './evidence/directory/registry.js';
export * from './evidence/classifier.js';
export * from './evidence/calendar.js';
export * from './evidence/normalizer.js';
export * from './evidence/fip-verifier.js';
export * from './evidence/snapshot-builder.js';
export * from './evidence/attestation-service.js';
export * from './evidence/passport-client.js';

export * from './identity/types.js';
export * from './identity/mock-idp.js';
export * from './identity/wallet-auth.js';

export * from './http/fip-app.js';
export * from './http/attestation-app.js';
export * from './http/unified-app.js';
