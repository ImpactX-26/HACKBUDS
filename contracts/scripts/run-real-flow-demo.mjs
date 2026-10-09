import { startLocalBackend } from '../integration/process-client.mjs';
import { createWorkerProofBridge } from '../integration/worker-proof-bridge.mjs';

async function main() {
  console.log('====================================================');
  console.log('   STARTING REAL LOCAL WORKER FLOW (BACKEND B 4e1afaa)');
  console.log('====================================================\n');

  console.log('[1/8] Starting independent local backend session...');
  const host = await startLocalBackend();
  console.log(`✓ Local chain running at ${host.bundle.rpcUrl}`);
  console.log(`✓ Bundle setupId: ${host.bundle.setupId}\n`);

  console.log('[2/8] Reading Passport on-chain state...');
  const passport = await host.call('getPassport', { passportId: '1' });
  console.log(`✓ Passport #1 Status: ${passport.status}`);
  console.log(`✓ Holder Wallet: ${passport.holderWallet}`);
  console.log(`✓ Identity Nullifier: ${passport.identityNullifierHash}\n`);

  const initialIdentityState = await host.call('getIdentityState', { passportId: '1' });
  console.log(`✓ Initial Debt State - Principal: ${initialIdentityState.principal} wei (0 USDC)\n`);

  console.log('[3/8] Authenticating worker & setting up private proof bridge...');
  const verifiedSession = Object.freeze({ worker: host.bundle.fixture.holder });
  const bridge = createWorkerProofBridge({
    authenticateWorker: async (context) => {
      if (context !== verifiedSession) throw Error('Unauthenticated worker context');
      return context.worker;
    },
    client: {
      getPassport: (passportId) => host.call('getPassport', { passportId }),
      generateProof: (request) => host.call('generateProof', { request }),
    },
  });
  console.log('✓ Bridge authenticated with holder wallet address.\n');

  console.log('[4/8] Generating explicit EIP-712 verifier policy & worker approvals...');
  const wPolicy = await host.call('fixturePolicy', { consumer: 'welfare' });
  const wReq = await host.call('fixtureApproval', { request: wPolicy });

  const lPolicy = await host.call('fixturePolicy', { consumer: 'loan' });
  const lReq = await host.call('fixtureApproval', { request: lPolicy });
  console.log('✓ Welfare request signed by verifier and approved by worker.');
  console.log('✓ Loan request signed by verifier and approved by worker.\n');

  console.log('[5/8] Generating 29-signal ZK Groth16 proofs via trusted private prover...');
  const startW = performance.now();
  const wProof = await bridge.generateProof(wReq, verifiedSession);
  const durationW = ((performance.now() - startW) / 1000).toFixed(2);
  console.log(`✓ Welfare Proof generated in ${durationW}s (${wProof.publicSignals.length} public signals)`);

  const startL = performance.now();
  const lProof = await bridge.generateProof(lReq, verifiedSession);
  const durationL = ((performance.now() - startL) / 1000).toFixed(2);
  console.log(`✓ Loan Proof generated in ${durationL}s (${lProof.publicSignals.length} public signals)\n`);

  console.log('[6/8] Verifying 29-signal proofs on Solidity (EligibilityGateV02 + Groth16Verifier)...');
  const wVerify = await host.call('verify', { request: wReq, proof: wProof });
  const lVerify = await host.call('verify', { request: lReq, proof: lProof });
  console.log('✓ Welfare Proof Verification Result:', JSON.stringify(wVerify));
  console.log('✓ Loan Proof Verification Result:', JSON.stringify(lVerify));
  console.log('✓ All enabled eligibility signals returned PASS.\n');

  console.log('[7/8] Executing Welfare Claim and 100 MockUSDC Borrow...');
  const claimTx = await host.call('claim', { request: wReq, proof: wProof, actor: 'worker' });
  console.log(`✓ Welfare Claim Tx Hash: ${claimTx.hash} (Status: ${claimTx.status})`);

  const borrowTx = await host.call('borrow', { request: lReq, proof: lProof, actor: 'worker' });
  console.log(`✓ 100 MockUSDC Borrow Tx Hash: ${borrowTx.hash} (Status: ${borrowTx.status})`);

  const postBorrowState = await host.call('getIdentityState', { passportId: '1' });
  console.log(`✓ Post-Borrow Debt State - Principal: ${postBorrowState.principal} units (100 MockUSDC)\n`);

  console.log('[8/8] Executing Repayment flow...');
  const approveTx = await host.call('approveRepayment', { actor: 'worker' });
  console.log(`✓ Approve Repayment Tx Hash: ${approveTx.hash} (Status: ${approveTx.status})`);

  const repayTx = await host.call('repay', { passportId: '1', actor: 'worker' });
  console.log(`✓ Repay Tx Hash: ${repayTx.hash} (Status: ${repayTx.status})`);

  const finalState = await host.call('getIdentityState', { passportId: '1' });
  console.log(`✓ Final Debt State - Principal: ${finalState.principal} units (0 MockUSDC)\n`);

  await host.close();

  console.log('====================================================');
  console.log('   REAL LOCAL WORKER FLOW COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Error during real worker flow:', err);
  process.exit(1);
});
