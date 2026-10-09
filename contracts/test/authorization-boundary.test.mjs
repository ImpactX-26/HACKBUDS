import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startLocalBackend } from '../integration/process-client.mjs';
import { createWorkerProofBridge } from '../integration/worker-proof-bridge.mjs';

test('Authorization Boundary: Unauthenticated & Unauthorized calls are rejected before proving', async () => {
  const host = await startLocalBackend();
  try {
    const passport = await host.call('getPassport', { passportId: '1' });
    const holderWallet = passport.holderWallet;
    const attackerWallet = '0x0000000000000000000000000000000000000099';

    // 1. Create Bridge without global session shortcut
    const bridge = createWorkerProofBridge({
      authenticateWorker: async (serverContext) => {
        if (!serverContext || !serverContext.workerWallet) {
          throw new Error('AUTHENTICATION_REQUIRED');
        }
        return serverContext.workerWallet;
      },
      client: {
        getPassport: (passportId) => host.call('getPassport', { passportId }),
        generateProof: (request) => host.call('generateProof', { request }),
      },
    });

    // 2. Fetch policy WITHOUT fixtureApproval
    const policyReq = await host.call('fixturePolicy', { consumer: 'loan' });
    assert.ok(!policyReq.workerSignature, 'fixturePolicy returns policy without worker approval signature');

    // 3. Verify unauthenticated call fails BEFORE proving
    await assert.rejects(
      () => bridge.generateProof(policyReq, null),
      (err) => err.code === 'AUTHENTICATION_REQUIRED' || err.message.includes('AUTHENTICATION_REQUIRED'),
      'Unauthenticated caller is rejected before proving'
    );

    // 4. Verify unauthorized caller fails BEFORE proving
    const attackerContext = { workerWallet: attackerWallet };
    await assert.rejects(
      () => bridge.generateProof(policyReq, attackerContext),
      (err) => err.code === 'UNAUTHORIZED_WORKER',
      'Unauthorized caller is rejected before proving'
    );

    // 5. Verify caller with holder wallet but missing worker EIP-712 approval signature fails
    const holderContext = { workerWallet: holderWallet };
    await assert.rejects(
      () => bridge.generateProof(policyReq, holderContext),
      (err) => err.code === 'WORKER_APPROVAL_INVALID',
      'Missing worker signature is rejected during policy preflight'
    );

  } finally {
    await host.close();
  }
});
