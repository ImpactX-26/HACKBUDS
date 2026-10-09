import { createHash } from 'node:crypto';
import { FIELD } from './poseidon5.js';

// PROPOSED mappings; strict external boundaries. Only named digest mapping reduces.
export function hashToFieldElement(hexDigest: string): bigint {
  if (typeof hexDigest !== 'string' || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(hexDigest)) {
    throw new Error('Expected exact 32-byte SHA-256 hex digest');
  }
  return BigInt('0x'+hexDigest.replace(/^0x/, '')) % FIELD;
}

export function addressToFieldElement(address: string): bigint {
  if (typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('Expected 0x-prefixed 20-byte EVM address');
  }
  return BigInt(address); // uint160, always below BN254 r; no reduction/hash.
}

export function providerIdToFieldElement(canonicalProviderId: string): bigint {
  // Candidate ASCII ID grammar for this prototype; no case folding or trimming.
  if (typeof canonicalProviderId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(canonicalProviderId)) {
    throw new Error('Expected canonical ASCII provider ID');
  }
  return hashToFieldElement(createHash('sha256')
    .update('GIGVAULT_PROVIDER_ID_V1|'+canonicalProviderId, 'utf8').digest('hex'));
}
