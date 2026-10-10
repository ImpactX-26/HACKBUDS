import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {TypedDataEncoder} from 'ethers';
import {createApplication} from '../local/app-session.mjs';
process.env.GIGVAULT_LOCAL_SETUP_CACHE??=resolve('artifacts/demo-setup-cache');

test('automatic accounts verify before activation, issue real passports, retain unique wallets and reject unauthorized signing across restart',async()=>{
 const directory=mkdtempSync(resolve(tmpdir(),'gv-managed-'));let app=await createApplication({dataDirectory:directory});
 const call=(token,method,p={})=>app.dispatch(method,{...p,token});
 async function start(phone,purpose='create') {return app.dispatch('phoneStart',{phone,purpose});}
 async function verify(flow){const mailbox=await app.dispatch('phoneMailbox',{flowToken:flow.flowToken});return app.dispatch('phoneVerify',{flowToken:flow.flowToken,code:mailbox.code});}
 async function identify(flow,aadhaarNumber){return app.dispatch('phoneIdentity',{flowToken:flow.flowToken,aadhaarNumber});}
 async function consentAndMint(token){const a=await call(token,'actionChallenge',{action:'CREATE_CONSENT'});await call(token,'actionSubmit',{id:a.id});const mint=await call(token,'actionChallenge',{action:'MINT_PASSPORT'});return call(token,'actionSubmit',{id:mint.id});}
 try{
  assert.equal(app.bundle.localPhoneAuthentication,true);
  const f=await start('+919000000001');assert.equal(f.role,'pending');assert.equal(f.wallet,null);
  await assert.rejects(()=>identify(f,'000000000001'),e=>(e.code??e.message)==='PHONE_VERIFICATION_REQUIRED');
  await assert.rejects(()=>call(undefined,'actionChallenge',{action:'CREATE_CONSENT'}),e=>(e.code??e.message)==='AUTHENTICATION_REQUIRED');
  await assert.rejects(()=>app.dispatch('phoneVerify',{flowToken:f.flowToken,code:'000000'}),/InvalidOtpCode/);
  await verify(f);await assert.rejects(()=>identify(f,'123456789012'),e=>(e.code??e.message)==='AADHAAR_IDENTIFIER_INVALID');
  const first=await identify(f,'000000000001');let d=await call(first.token,'dashboard');assert.equal(d.role,'worker');assert.equal(d.connectionMode,'managed');assert.equal(d.passport,null);
  assert.ok(!app.bundle.devWallets.some(x=>x.address===d.wallet));const address=d.wallet;
  const issued=await consentAndMint(first.token);assert.equal(issued.passport.status,'ACTIVE');const passportId=issued.passport.passportId;
  await assert.rejects(()=>identify(f,'000000000001'),e=>(e.code??e.message)==='PHONE_FLOW_EXPIRED');
  await assert.rejects(()=>start('+919000000001'),e=>(e.code??e.message)==='PHONE_ALREADY_BOUND');
  const secondFlow=await start('+919000000002');await verify(secondFlow);
  await assert.rejects(()=>identify(secondFlow,'000000000001'),e=>(e.code??e.message)==='IDENTITY_ALREADY_BOUND');
  const second=await identify(secondFlow,'000000000002');assert.notEqual(first.workerWallet,second.workerWallet);
  const ownedAction=await call(first.token,'actionChallenge',{action:'CREATE_CONSENT'});
  await assert.rejects(()=>call(second.token,'actionSubmit',{id:ownedAction.id}),e=>(e.code??e.message)==='ACTION_EXPIRED');
  await assert.rejects(()=>call(second.token,'recoveryStatus',{passportId}),e=>(e.code??e.message)==='UNAUTHORIZED_WORKER');
  await assert.rejects(()=>call(first.token,'managedTransaction',{kind:'arbitrary',to:second.workerWallet}),e=>(e.code??e.message)==='ACTION_UNSUPPORTED');
  await assert.rejects(()=>call(first.token,'sign',{message:'anything'}),e=>(e.code??e.message)==='METHOD_UNSUPPORTED');
  const challenge=await app.dispatch('challenge',{wallet:address});await assert.rejects(()=>app.dispatch('login',{nonce:challenge.value.nonce,signature:'0x'}),e=>(e.code??e.message)==='AUTHENTICATION_REQUIRED');
  assert.doesNotMatch(JSON.stringify([app.bundle,first,d]),/privateKey|mnemonic/);
  assert.doesNotMatch(readFileSync(resolve(directory,'managed-wallets.json'),'utf8'),/privateKey|mnemonic/);
  await call(first.token,'logout');await assert.rejects(()=>call(first.token,'dashboard'),e=>(e.code??e.message)==='AUTHENTICATION_REQUIRED');
  await app.close();app=await createApplication({dataDirectory:directory});
  const returning=await start('+919000000001','signin');await verify(returning);
  await assert.rejects(()=>identify(returning,'000000000002'),e=>(e.code??e.message)==='IDENTITY_AUTHENTICATION_FAILED');
  const restored=await identify(returning,'000000000001');d=await call(restored.token,'dashboard');
  assert.equal(d.wallet,address);assert.equal(d.passport.passportId,passportId);assert.equal(d.passport.status,'ACTIVE');assert.ok(d.history.length);
  assert.equal((await call(restored.token,'dashboard')).wallet,address);
  // Existing verifier authorization and exact worker approval remain real signatures.
  const rpc=app.session.local.provider,verifier=app.bundle.roles.verifier;
  const c=await app.dispatch('challenge',{wallet:verifier});const sig=await rpc.send('eth_signTypedData_v4',[verifier,TypedDataEncoder.getPayload(c.domain,c.types,c.value)]);
  const vt=(await app.dispatch('login',{nonce:c.value.nonce,signature:sig,connectionMode:'local'})).token;
  const policy=await call(vt,'policyPrepare',{passportId,consumer:'gate',expiresInSeconds:600,criteria:{incomeEnabled:'0',incomeWindowMonths:'0',minAverageIncomePaise:'0',historyEnabled:'1',minHistoryMonths:'3',activityEnabled:'0',activityIsWeekly:'0',activityWindow:'0',minActivePeriods:'0',maxEvidenceAgeDays:'30'}});
  const ps=await rpc.send('eth_signTypedData_v4',[verifier,TypedDataEncoder.getPayload(policy.domain,policy.types,policy.value)]);await call(vt,'policySubmit',{id:policy.id,signature:ps});
  await call(restored.token,'approve',{id:policy.id});assert.equal((await call(restored.token,'dashboard')).requests[0].status,'APPROVED');
  await assert.rejects(()=>call(restored.token,'managedTransaction',{kind:'consumer',id:policy.id}),e=>(e.code??e.message)==='PROOF_REQUIRED');
 }finally{await app.close();}
});
