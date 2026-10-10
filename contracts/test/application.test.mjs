import {fictionalAadhaarIdentifiers} from '../local/fictional-aadhaar.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {TypedDataEncoder,toUtf8Bytes,hexlify} from 'ethers';
import {createApplication} from '../local/app-session.mjs';
process.env.GIGVAULT_LOCAL_SETUP_CACHE??=resolve('artifacts/demo-setup-cache');
test('connected application: signed onboarding, private FIP, real proofs, consumers and controlled recovery',async()=>{
 const app=await createApplication(),rpc=app.session.local.provider,b=app.bundle;
 const address=i=>b.devWallets[i].address;
 const sign=(wallet,a)=>rpc.send('eth_signTypedData_v4',[wallet,TypedDataEncoder.getPayload(a.domain,a.types,a.value)]);
 const message=(wallet,m)=>rpc.send('eth_sign',[wallet,hexlify(toUtf8Bytes(m))]);
 const call=(token,m,p={})=>app.dispatch(m,{...p,token});
 async function auth(i){const a=await app.dispatch('challenge',{wallet:address(i)}),signature=await sign(address(i),a),v=await app.dispatch('login',{nonce:a.value.nonce,signature});await assert.rejects(()=>app.dispatch('login',{nonce:a.value.nonce,signature}),e=>e.code==='AUTHENTICATION_REQUIRED');return v.token;}
 async function onboard(i,persona,phone,recoveryIdentity){const token=await auth(i),s=await call(token,'onboardStart',{recoveryIdentity});await call(token,'onboardWallet',{sessionId:s.sessionId,signature:await message(address(i),s.message)});await assert.rejects(async()=>call(token,'onboardWallet',{sessionId:s.sessionId,signature:await message(address(i),s.message)}));await call(token,'otpStart',{sessionId:s.sessionId,phone});const otp=await call(token,'otpMailbox',{sessionId:s.sessionId});await assert.rejects(()=>call(token,'otpVerify',{sessionId:s.sessionId,code:'000000'}));await call(token,'otpVerify',{sessionId:s.sessionId,code:otp.code});await call(token,'identityCommit',{sessionId:s.sessionId,aadhaarNumber:fictionalAadhaarIdentifiers[persona]});return token;}
 async function action(token,i,name,requestId){const a=await call(token,'actionChallenge',{action:name,requestId}),signature=await message(address(i),a.message);const v=await call(token,'actionSubmit',{id:a.id,signature});await assert.rejects(()=>call(token,'actionSubmit',{id:a.id,signature}),/ACTION_EXPIRED/);return v;}
 async function tx(token,i,t,id){const signer=await rpc.getSigner(address(i)),sent=await signer.sendTransaction(t);await sent.wait();return call(token,'transactionMined',{hash:sent.hash,id});}
 let worker,verifier,admin;
 async function proof(token,i,id,consumer){const a=await call(token,'applyService',{consumer});const approval=await call(token,'approval',{id:a.id});await assert.rejects(async()=>call(token,'approve',{id:a.id,signature:await sign(address(3),approval)}),/WORKER_APPROVAL_INVALID/);await call(token,'approve',{id:a.id,signature:await sign(address(i),approval)});await action(token,i,'RECONSTRUCT_EVIDENCE',a.id);return a.id;}
 try{
  assert.equal(await app.session.client.getNextPassportId(),'1');
  await assert.rejects(()=>app.dispatch('dashboard',{}),e=>e.code==='AUTHENTICATION_REQUIRED');
  worker=await onboard(2,'RAMESH','+919000000001');verifier=await auth(4);admin=await auth(0);
  await assert.rejects(()=>call(verifier,'actionChallenge',{action:'CREATE_CONSENT'}),/ONBOARDING_REQUIRED/);
  await assert.rejects(()=>call(worker,'recoveryAuthorize',{passportId:'1',wallet:address(3)}),/ROLE_REQUIRED/);
  await action(worker,2,'CREATE_CONSENT');await action(worker,2,'MINT_PASSPORT');
  let dashboard=await call(worker,'dashboard');assert.equal(dashboard.passport.status,'ACTIVE');assert.equal(dashboard.passport.passportId,'1');assert.ok(dashboard.summary.incomeLast6MonthsPaise>0);
  const leak=JSON.stringify(await call(verifier,'dashboard'));for(const secret of ['monthlyGigIncomeTotals','weeklyActivity','phoneHash','privateKey','witness'])assert.ok(!leak.includes(secret));
  const welfare=await proof(worker,2,'1','welfare');await tx(worker,2,await call(worker,'consumerTransaction',{id:welfare}),welfare);await assert.rejects(()=>call(worker,'consumerTransaction',{id:welfare}),/PROOF_REQUIRED/);
  await assert.rejects(()=>call(worker,'applyService',{consumer:'welfare'}),/BENEFIT_ALREADY_CLAIMED/);
  const loan=await proof(worker,2,'1','loan');await tx(worker,2,await call(worker,'consumerTransaction',{id:loan}),loan);dashboard=await call(worker,'dashboard');assert.equal(dashboard.identityState.principal,'100000000');assert.equal(dashboard.identityState.claimed,true);await assert.rejects(()=>call(worker,'applyService',{consumer:'loan'}),/ACTIVE_LOAN/);
  await tx(admin,0,await call(admin,'adminTransaction',{passportId:'1'}));await tx(admin,0,await call(admin,'adminTransaction',{passportId:'1',authorize:true}));
  await call(admin,'recoveryAuthorize',{passportId:'1',wallet:address(3)});
  const replacement=await onboard(3,'RAMESH','+919000000002',dashboard.passport.identityNullifierHash);
  await assert.rejects(()=>call(worker,'actionChallenge',{action:'CREATE_CONSENT'}),/ONBOARDING_REQUIRED/);
  await action(replacement,3,'CREATE_CONSENT');await action(replacement,3,'REISSUE_PASSPORT');
  dashboard=await call(replacement,'dashboard');assert.equal(dashboard.passport.passportId,'2');assert.equal(dashboard.identityState.principal,'100000000');assert.equal(dashboard.identityState.claimed,true);
  // Debt repayment requires actual funds: transfer the original borrowed balance from the old wallet.
  await (await app.session.local.token.connect(await rpc.getSigner(address(2))).transfer(address(3),100000000n)).wait();
  await tx(replacement,3,await call(replacement,'repaymentTransaction',{approve:true}));await tx(replacement,3,await call(replacement,'repaymentTransaction'));assert.equal((await call(replacement,'dashboard')).identityState.principal,'0');
  const imran=await onboard(5,'IMRAN','+919000000003');await action(imran,5,'CREATE_CONSENT');await action(imran,5,'MINT_PASSPORT');const imranId=(await call(imran,'dashboard')).passport.passportId;
  const rejected=await proof(imran,5,imranId,'loan');const result=(await call(imran,'dashboard')).requests.find(r=>r.id===rejected).result;assert.equal(result.income,'PASS');assert.equal(result.activity,'FAIL');await assert.rejects(()=>call(imran,'consumerTransaction',{id:rejected}),/CONDITION_FAILED/);
  await assert.rejects(()=>action(imran,5,'REFRESH_PASSPORT'));await action(imran,5,'CREATE_CONSENT');await action(imran,5,'REFRESH_PASSPORT');assert.equal((await call(imran,'dashboard')).passport.evidenceVersion,'2');
  await assert.rejects(()=>call(replacement,'approval',{id:rejected}),/UNAUTHORIZED_WORKER/);
  const freshApplication=await call(imran,'applyService',{consumer:'loan'});assert.notEqual(freshApplication.id,rejected);
  await call(imran,'revokeConsent');await assert.rejects(()=>action(imran,5,'REFRESH_PASSPORT'));
  assert.equal(app.session.stats.realProofs,3);
 }finally{await app.close();}
});
