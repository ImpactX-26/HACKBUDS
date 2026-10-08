import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, beforeEach, afterEach } from 'node:test';
import solc from 'solc';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, ZeroAddress, ZeroHash, id } from 'ethers';

const input = {
  language: 'Solidity',
  sources: {'GigPassport.sol': {content: readFileSync('src/GigPassport.sol', 'utf8')}},
  settings: {optimizer: {enabled: true, runs: 200}, evmVersion: 'shanghai',
    outputSelection: {'*': {'*': ['abi', 'evm.bytecode.object']}}}
};
const output = JSON.parse(solc.compile(JSON.stringify(input), {import: (path) => {
  try { return {contents: readFileSync(resolve('node_modules', path), 'utf8')}; }
  catch { return {error: `Missing dependency: ${path}`}; }
}}));
assert.deepEqual((output.errors ?? []).filter(e => e.severity === 'error'), []);
const artifact = output.contracts['GigPassport.sol'].GigPassport;
console.log(`Compiled with ${solc.version()}; local EVM only; opaque test commitments are NOT Poseidon vectors.`);

let chain, provider, admin, attester, worker, other, replacement, passport, addresses, now;
const identity = id('SYNTHETIC_TEST_IDENTITY');
const identity2 = id('SYNTHETIC_OTHER_IDENTITY');
const evidence = (overrides = {}) => ({commitment: 123n, updatedAt: now - 100n,
  schemaVersion: 1n, providerRef: id('SYNTHETIC_PROVIDER'), sourceDirectoryVersion: 3n, ...overrides});
const mint = async (identityHash = identity, holder = addresses[2], values = evidence()) =>
  (await passport.connect(attester).mint(await passport.nextPassportId(), holder, identityHash, values)).wait();
const sent = async (promise) => (await promise).wait();
const events = receipt => receipt.logs.map(log => {
  try { return passport.interface.parseLog(log); } catch { return null; }
}).filter(Boolean);
async function rejects(call, name) {
  await assert.rejects(call, error => {
    const parsed = passport.interface.parseError(error.data ?? error.info?.error?.data?.result);
    assert.equal(parsed?.name, name);
    return true;
  });
}

beforeEach(async () => {
  chain = ganache.provider({logging: {quiet: true}, wallet: {totalAccounts: 5},
    chain: {hardfork: 'shanghai'}});
  provider = new BrowserProvider(chain); provider.pollingInterval = 10;
  [admin, attester, worker, other, replacement] = await Promise.all([0,1,2,3,4].map(i => provider.getSigner(i)));
  addresses = await Promise.all([admin, attester, worker, other, replacement].map(s => s.getAddress()));
  now = BigInt((await provider.getBlock('latest')).timestamp);
  passport = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, admin)
    .deploy(addresses[0], addresses[1]);
  await passport.waitForDeployment();
});
afterEach(async () => { provider.destroy(); await chain.disconnect(); });

test('separate initial authority keys; worker and admin cannot mint or refresh', async () => {
  const role = await passport.ATTESTER_ROLE();
  assert.equal(await passport.hasRole(role, addresses[1]), true);
  assert.equal(await passport.hasRole(role, addresses[0]), false);
  for (const signer of [worker, admin, other]) {
    await rejects(() => passport.connect(signer).mint.staticCall(1, addresses[2], identity, evidence()), 'AccessControlUnauthorizedAccount');
    await rejects(() => passport.connect(signer).refresh.staticCall(1, evidence()), 'AccessControlUnauthorizedAccount');
  }
});

test('constructor rejects zero and overlapping keys', async () => {
  const factory = new ContractFactory(artifact.abi, artifact.evm.bytecode.object, admin);
  for (const keys of [[ZeroAddress, addresses[1]], [addresses[0], ZeroAddress], [addresses[0], addresses[0]]]) {
    await assert.rejects(() => factory.deploy(...keys));
  }
});

test('first mint stores ACTIVE credential, holder, version, identity pointers and directory event', async () => {
  const receipt = await mint();
  const p = await passport.getPassport(1);
  assert.equal(p.holderWallet, addresses[2]); assert.equal(p.identityNullifierHash, identity);
  assert.equal(p.status, 0n); assert.equal(p.evidenceVersion, 1n); assert.equal(p.evidenceCommitment, 123n);
  assert.equal(p.evidenceUpdatedAt, now - 100n); assert.equal(p.schemaVersion, 1n);
  assert.equal(p.evidenceProvider, evidence().providerRef); assert.equal(p.supersedes, 0n);
  assert.ok(p.issuedAt >= now);
  assert.equal(await passport.ownerOf(1), addresses[2]); assert.equal(await passport.balanceOf(addresses[2]), 1n);
  assert.equal(await passport.activePassportByIdentity(identity), 1n);
  assert.equal(await passport.latestPassportByIdentity(identity), 1n);
  assert.equal(await passport.nextPassportId(), 2n);
  const event = events(receipt).find(e => e.name === 'PassportIssued');
  assert.equal(event.args.sourceDirectoryVersion, 3n); assert.equal(event.args.evidenceVersion, 1n);
  assert.equal(event.args.evidenceCommitment, 123n); assert.equal(event.args.evidenceUpdatedAt, now - 100n);
});

test('second ACTIVE identity rejected even with different holder', async () => {
  await mint();
  await rejects(() => passport.connect(attester).mint.staticCall(2, addresses[4], identity, evidence()), 'ActivePassportExists');
  assert.equal(await passport.nextPassportId(), 2n); assert.equal(await passport.ownerOf(1), addresses[2]);
});

test('expected-ID race rejects atomically; recomputed next-ID commitment succeeds', async () => {
  const expected = await passport.nextPassportId();
  await mint();
  await rejects(() => passport.connect(attester).mint.staticCall(expected, addresses[3], identity2, evidence()), 'ExpectedIdMismatch');
  // Also mine a failing call, rather than only simulate it.
  await assert.rejects(async () => sent(passport.connect(attester).mint(expected, addresses[3], identity2, evidence(), {gasLimit: 500000})));
  assert.equal(await passport.nextPassportId(), 2n); assert.equal(await passport.activePassportByIdentity(identity2), 0n);
  await mint(identity2, addresses[3], evidence({commitment: 456n}));
  assert.equal((await passport.getPassport(2)).evidenceCommitment, 456n);
  assert.equal(await passport.nextPassportId(), 3n);
});

test('invalid holder/identity and future cutoff reject without consuming ID', async () => {
  for (const [holder, identityHash, ev] of [[ZeroAddress, identity, evidence()],
    [addresses[2], ZeroHash, evidence()], [addresses[2], identity, evidence({updatedAt: now + 10000n})]]) {
    await rejects(() => passport.connect(attester).mint.staticCall(1, holder, identityHash, ev), 'InvalidInput');
  }
  assert.equal(await passport.nextPassportId(), 1n);
});

test('nonexistent credential read/refresh/revoke reject rather than defaulting ACTIVE', async () => {
  await rejects(() => passport.getPassport(99), 'ERC721NonexistentToken');
  await rejects(() => passport.connect(attester).refresh.staticCall(99, evidence()), 'ERC721NonexistentToken');
  await rejects(() => passport.revoke.staticCall(99, 'synthetic reason'), 'ERC721NonexistentToken');
});

test('all transfers and token/operator approvals reject; no holder changes', async () => {
  await mint(); const owned = passport.connect(worker);
  for (const target of [addresses[3], addresses[2], ZeroAddress]) {
    await rejects(() => owned.transferFrom.staticCall(addresses[2], target, 1), 'NonTransferable');
    await rejects(() => owned['safeTransferFrom(address,address,uint256)'].staticCall(addresses[2], target, 1), 'NonTransferable');
    await rejects(() => owned['safeTransferFrom(address,address,uint256,bytes)'].staticCall(addresses[2], target, 1, '0x'), 'NonTransferable');
  }
  await rejects(() => owned.approve.staticCall(addresses[3], 1), 'NonTransferable');
  await rejects(() => owned.setApprovalForAll.staticCall(addresses[3], true), 'NonTransferable');
  assert.equal(await passport.ownerOf(1), addresses[2]); assert.equal(await passport.getApproved(1), ZeroAddress);
});

test('refresh increments internally and preserves identity, holder, issuance time and ID', async () => {
  await mint(); const before = await passport.getPassport(1);
  const receipt = await sent(passport.connect(attester).refresh(1, evidence({commitment: 456n, updatedAt: now - 50n, sourceDirectoryVersion: 4n})));
  const after = await passport.getPassport(1);
  assert.equal(after.evidenceVersion, 2n); assert.equal(after.evidenceCommitment, 456n);
  for (const field of ['holderWallet','identityNullifierHash','issuedAt','status','supersedes']) assert.equal(after[field], before[field]);
  assert.equal(await passport.nextPassportId(), 2n);
  const event = events(receipt).find(e => e.name === 'EvidenceRefreshed');
  assert.equal(event.args.sourceDirectoryVersion, 4n); assert.equal(event.args.evidenceVersion, 2n);
  assert.equal(event.args.evidenceCommitment, 456n); assert.equal(event.args.evidenceUpdatedAt, now - 50n);
});

test('unchanged commitment, regressed and future timestamps reject; equal cutoff is valid', async () => {
  await mint();
  await rejects(() => passport.connect(attester).refresh.staticCall(1, evidence()), 'CommitmentUnchanged');
  await rejects(() => passport.connect(attester).refresh.staticCall(1, evidence({commitment: 456n, updatedAt: now - 101n})), 'EvidenceTimestampRegressed');
  await rejects(() => passport.connect(attester).refresh.staticCall(1, evidence({commitment: 456n, updatedAt: now + 10000n})), 'InvalidInput');
  assert.equal((await passport.getPassport(1)).evidenceVersion, 1n);
  await sent(passport.connect(attester).refresh(1, evidence({commitment: 456n})));
  assert.equal((await passport.getPassport(1)).evidenceVersion, 2n);
});

test('worker and attester cannot revoke or authorize replacement', async () => {
  await mint();
  for (const signer of [worker, attester, other]) {
    await rejects(() => passport.connect(signer).revoke.staticCall(1, 'synthetic reason'), 'AccessControlUnauthorizedAccount');
    await rejects(() => passport.connect(signer).authorizeReissue.staticCall(identity), 'AccessControlUnauthorizedAccount');
  }
});

test('revocation is terminal, clears only active pointer, logs reason and retains owner/history', async () => {
  await mint(); const receipt = await sent(passport.revoke(1, 'synthetic recovery test'));
  assert.equal((await passport.getPassport(1)).status, 1n);
  assert.equal(await passport.activePassportByIdentity(identity), 0n);
  assert.equal(await passport.latestPassportByIdentity(identity), 1n);
  assert.equal(await passport.ownerOf(1), addresses[2]); assert.equal(await passport.reissueAllowed(identity), false);
  assert.equal(events(receipt).find(e => e.name === 'PassportRevoked').args.reason, 'synthetic recovery test');
  await rejects(() => passport.connect(attester).refresh.staticCall(1, evidence({commitment: 456n})), 'PassportNotActive');
  await rejects(() => passport.revoke.staticCall(1, 'again'), 'PassportNotActive');
});

test('unknown or ACTIVE identities cannot be authorized for replacement', async () => {
  await rejects(() => passport.authorizeReissue.staticCall(identity), 'ReissueRequiresRevokedPassport');
  await mint();
  await rejects(() => passport.authorizeReissue.staticCall(identity), 'ReissueRequiresRevokedPassport');
});

test('replacement requires separate ADMIN authorization and consumes it on successful mint', async () => {
  await mint(); await sent(passport.revoke(1, 'synthetic recovery'));
  await rejects(() => passport.connect(attester).mint.staticCall(2, addresses[4], identity, evidence({commitment: 456n})), 'ReissueNotAuthorized');
  await sent(passport.authorizeReissue(identity));
  // Failed replacement must preserve authorization and ID.
  await rejects(() => passport.connect(attester).mint.staticCall(1, addresses[4], identity, evidence()), 'ExpectedIdMismatch');
  await assert.rejects(async () => sent(passport.connect(attester).mint(2, ZeroAddress, identity, evidence(), {gasLimit: 500000})));
  assert.equal(await passport.reissueAllowed(identity), true); assert.equal(await passport.nextPassportId(), 2n);
  const receipt = await mint(identity, addresses[4], evidence({commitment: 456n}));
  const fresh = await passport.getPassport(2);
  assert.equal(fresh.identityNullifierHash, identity); assert.equal(fresh.holderWallet, addresses[4]);
  assert.equal(fresh.status, 0n); assert.equal(fresh.supersedes, 1n); assert.equal(fresh.evidenceVersion, 1n);
  assert.equal((await passport.getPassport(1)).status, 1n); assert.equal(await passport.reissueAllowed(identity), false);
  assert.equal(await passport.activePassportByIdentity(identity), 2n); assert.equal(await passport.latestPassportByIdentity(identity), 2n);
  assert.equal(events(receipt).find(e => e.name === 'PassportIssued').args.supersedes, 1n);
  await rejects(() => passport.connect(attester).refresh.staticCall(1, evidence({commitment: 789n})), 'PassportNotActive');
  await rejects(() => passport.connect(attester).mint.staticCall(3, addresses[3], identity, evidence()), 'ActivePassportExists');
  await sent(passport.revoke(2, 'second synthetic recovery'));
  await rejects(() => passport.connect(attester).mint.staticCall(3, addresses[3], identity, evidence()), 'ReissueNotAuthorized');
});

test('revoking one identity leaves another identity ACTIVE and refreshable', async () => {
  await mint(); await mint(identity2, addresses[3], evidence({commitment: 456n}));
  await sent(passport.revoke(1, 'synthetic isolated revocation'));
  assert.equal(await passport.activePassportByIdentity(identity2), 2n);
  await sent(passport.connect(attester).refresh(2, evidence({commitment: 789n})));
  assert.equal((await passport.getPassport(2)).status, 0n);
  assert.equal((await passport.getPassport(2)).evidenceVersion, 2n);
});

test('role grants preserve separation, rotation works, revoked attester cannot write', async () => {
  const attesterRole = await passport.ATTESTER_ROLE(), adminRole = await passport.ADMIN_ROLE();
  await rejects(() => passport.grantRole.staticCall(attesterRole, addresses[0]), 'RolesMustBeSeparate');
  await rejects(() => passport.grantRole.staticCall(adminRole, addresses[1]), 'RolesMustBeSeparate');
  await rejects(() => passport.grantRole.staticCall(ZeroHash, addresses[1]), 'RolesMustBeSeparate');
  await rejects(() => passport.grantRole.staticCall(attesterRole, ZeroAddress), 'InvalidInput');
  await rejects(() => passport.connect(worker).grantRole.staticCall(attesterRole, addresses[2]), 'AccessControlUnauthorizedAccount');
  await sent(passport.grantRole(attesterRole, addresses[3])); await sent(passport.revokeRole(attesterRole, addresses[1]));
  await rejects(() => passport.connect(attester).mint.staticCall(1, addresses[2], identity, evidence()), 'AccessControlUnauthorizedAccount');
  await sent(passport.connect(other).mint(1, addresses[2], identity, evidence()));
  assert.equal(await passport.ownerOf(1), addresses[2]);
});

test('ERC165 advertises ERC721 and AccessControl interfaces', async () => {
  assert.equal(await passport.supportsInterface('0x80ac58cd'), true);
  assert.equal(await passport.supportsInterface('0x7965db0b'), true);
  assert.equal(await passport.supportsInterface('0xffffffff'), false);
});
