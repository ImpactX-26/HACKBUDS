import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {TypedDataEncoder} from 'ethers';
import {deployLocal} from '../local/deploy.mjs';
import {prepareLocalSetup} from '../local/setup.mjs';
import {domainFor,manifest as order} from '../proposal/authorization-v02.mjs';
import {digest} from '../../circuits/service/engine.mjs';
test('deployment script produces six live local contracts and a consistent public manifest',async()=>{
  const local=await deployLocal();
  try {
    const m=JSON.parse(readFileSync(local.manifestPath,'utf8'));
    assert.equal(m.localOnly,true);assert.equal(m.chainId,1337);assert.match(m.rpcUrl,/^http:\/\/127\.0\.0\.1:\d+$/);
    assert.deepEqual(m.publicSignalOrder,order);assert.equal(Object.keys(m.contracts).length,6);
    for(const entry of Object.values(m.contracts)) {
      assert.notEqual(await local.provider.getCode(entry.address),'0x');assert.ok(JSON.parse(readFileSync(entry.abi,'utf8')).length);
    }
    assert.equal(m.setupId,local.setup.id);
    for(const [name,hash]of Object.entries(m.setupDigests))assert.equal(digest(local.setup[name]),hash);
    for(const c of Object.values(local.consumers)) {
      assert.equal(await c.mathVerifier(),await local.math.getAddress());
      assert.equal(await c.passport(),await local.passport.getAddress());
      assert.equal(await c.intendedVerifier(),m.roles.verifier);
      assert.equal(await c.domainHash(),TypedDataEncoder.hashDomain(domainFor(1337,await c.getAddress())));
    }
    assert.equal(await local.passport.hasRole(await local.passport.ADMIN_ROLE(),m.roles.admin),true);
    assert.equal(await local.passport.hasRole(await local.passport.ATTESTER_ROLE(),m.roles.attester),true);
    assert.notEqual(m.roles.admin,m.roles.attester);
    assert.equal(await local.token.decimals(),6n);
    assert.equal(await local.token.balanceOf(await local.consumers.loan.getAddress()),1000n*10n**6n);
    assert.equal(Object.keys(m).some(k=>/secret|privateKey|mnemonic/i.test(k)),false);
  } finally {await local.close();}
  assert.equal(existsSync(local.setup.directory),false);
  // Closing twice must be safe for finally/signal handlers.
  await local.close();
});
test('failed transcript validation cleans its disposable session',async()=>{
  const parent=resolve('artifacts/local');mkdirSync(parent,{recursive:true});
  const file=resolve(parent,'bad-transcript.ptau');writeFileSync(file,'INVALID_PUBLIC_TRANSCRIPT');
  const before=readdirSync(parent),original=process.env.GIGVAULT_TEST_PTAU;
  process.env.GIGVAULT_TEST_PTAU=file;
  try {await assert.rejects(()=>prepareLocalSetup(),/Transcript hash mismatch/);assert.deepEqual(readdirSync(parent),before);}
  finally {if(original===undefined)delete process.env.GIGVAULT_TEST_PTAU;else process.env.GIGVAULT_TEST_PTAU=original;rmSync(file);}
});
