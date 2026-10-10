import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {TypedDataEncoder,hexlify,toUtf8Bytes} from 'ethers';
import {createApplication} from '../local/app-session.mjs';
import {fictionalAadhaarIdentifiers} from '../local/fictional-aadhaar.mjs';
import {requestsForView,recoveryStage} from '../../frontend/lib/workflow-feedback.mjs';
process.env.GIGVAULT_LOCAL_SETUP_CACHE??=resolve('artifacts/demo-setup-cache');
test('guided recovery finishes on the approved wallet using the original verified phone; custom request remains pending',async()=>{
 const app=await createApplication(),rpc=app.session.local.provider,b=app.bundle,address=i=>b.devWallets[i].address;
 const call=(token,method,p={})=>app.dispatch(method,{...p,token});
 const message=(i,m)=>rpc.send('eth_sign',[address(i),hexlify(toUtf8Bytes(m))]);
 const typed=(i,a)=>rpc.send('eth_signTypedData_v4',[address(i),TypedDataEncoder.getPayload(a.domain,a.types,a.value)]);
 async function auth(i){const a=await app.dispatch('challenge',{wallet:address(i)});return (await app.dispatch('login',{nonce:a.value.nonce,signature:await typed(i,a),connectionMode:'local'})).token;}
 async function registration(token,i){const a=await call(token,'onboardStart');await call(token,'onboardWallet',{sessionId:a.sessionId,signature:await message(i,a.message)});return a.sessionId;}
 async function phone(token,id){await call(token,'otpStart',{sessionId:id,phone:'+919000000001'});const otp=await call(token,'otpMailbox',{sessionId:id});await call(token,'otpVerify',{sessionId:id,code:otp.code});}
 async function action(token,i,action){const a=await call(token,'actionChallenge',{action});return call(token,'actionSubmit',{id:a.id,signature:await message(i,a.message)});}
 async function tx(token,i,p){const sent=await (await rpc.getSigner(address(i))).sendTransaction(p);const receipt=await sent.wait();await call(token,'transactionMined',{hash:receipt.hash});}
 try{
  const worker=await auth(2),admin=await auth(0),verifier=await auth(4),replacement=await auth(3),foreign=await auth(5);
  const id=await registration(worker,2);await phone(worker,id);await call(worker,'identityCommit',{sessionId:id,aadhaarNumber:fictionalAadhaarIdentifiers.RAMESH});await action(worker,2,'CREATE_CONSENT');await action(worker,2,'MINT_PASSPORT');
  let state=await call(admin,'recoveryStatus',{passportId:'1'});assert.equal(recoveryStage(state),'REVOKE');
  await assert.rejects(()=>call(foreign,'recoveryStatus',{passportId:'1'}),/UNAUTHORIZED_WORKER/);
  await assert.rejects(()=>call(worker,'adminTransaction',{passportId:'1'}),/ROLE_REQUIRED/);
  await assert.rejects(()=>call(admin,'adminTransaction',{passportId:'1',authorize:true}),/REVOKE_FIRST/);
  await assert.rejects(()=>call(admin,'recoveryAuthorize',{passportId:'1',wallet:'invalid'}),/INVALID_WALLET_ADDRESS/);
  // Existing service request must not replace the exact custom request in the results view.
  await call(worker,'applyService',{consumer:'loan'});
  const custom=await call(verifier,'policyPrepare',{passportId:'1',consumer:'gate',criteria:{historyEnabled:'1',minHistoryMonths:'6'},expiresInSeconds:900});await call(verifier,'policySubmit',{id:custom.id,signature:await typed(4,custom)});
  const exact=requestsForView((await call(verifier,'dashboard')).requests,'results',custom.id);assert.equal(exact.length,1);assert.equal(exact[0].id,custom.id);assert.equal(exact[0].status,'PENDING_WORKER');assert.equal(exact[0].result,null);const noApproval=await call(worker,'actionChallenge',{action:'RECONSTRUCT_EVIDENCE',requestId:custom.id});await assert.rejects(()=>message(2,noApproval.message).then(signature=>call(worker,'actionSubmit',{id:noApproval.id,signature})),/WORKER_APPROVAL_REQUIRED/);
  await tx(admin,0,await call(admin,'adminTransaction',{passportId:'1'}));state=await call(admin,'recoveryStatus',{passportId:'1'});assert.equal(recoveryStage(state),'AUTHORIZE');
  await assert.rejects(()=>call(admin,'adminTransaction',{passportId:'1'}),/PASSPORT_ALREADY_REVOKED/);
  await assert.rejects(()=>call(admin,'recoveryAuthorize',{passportId:'1',wallet:address(3)}),/RECOVERY_NOT_AUTHORIZED/);
  await tx(admin,0,await call(admin,'adminTransaction',{passportId:'1',authorize:true}));state=await call(admin,'recoveryStatus',{passportId:'1'});assert.equal(recoveryStage(state),'APPROVE');
  await assert.rejects(()=>call(admin,'adminTransaction',{passportId:'1',authorize:true}),/REISSUE_ALREADY_AUTHORIZED/);
  await call(admin,'recoveryAuthorize',{passportId:'1',wallet:address(3)});assert.equal(recoveryStage(await call(admin,'recoveryStatus',{passportId:'1'})),'REPLACEMENT_ONBOARDING');
  const pending=await call(replacement,'dashboard');assert.equal(pending.recovery.replacementApproved,true);assert.equal(pending.recovery.phoneMasked,'+91******0001');
  // No caller-supplied recovery identity: server detects the actual approved replacement grant.
  const recovered=await registration(replacement,3);assert.equal((await call(replacement,'dashboard')).onboarding.recovery,true);await phone(replacement,recovered);
  await assert.rejects(()=>call(replacement,'identityCommit',{sessionId:recovered,aadhaarNumber:fictionalAadhaarIdentifiers.SURESH}),/RECOVERY_IDENTITY_MISMATCH/);
  await call(replacement,'identityCommit',{sessionId:recovered,aadhaarNumber:fictionalAadhaarIdentifiers.RAMESH});assert.equal((await call(replacement,'dashboard')).reissueAllowed,true);
  await action(replacement,3,'CREATE_CONSENT');await action(replacement,3,'REISSUE_PASSPORT');const completed=await call(replacement,'dashboard');assert.equal(completed.passport.status,'ACTIVE');assert.equal(completed.passport.passportId,'2');assert.equal(completed.passport.holderWallet.toLowerCase(),address(3).toLowerCase());
  state=await call(admin,'recoveryStatus',{passportId:'1'});assert.equal(state.replacementPassportId,'2');assert.equal(recoveryStage(state),'COMPLETE');assert.equal(state.reissueAllowed,false);
  await assert.rejects(()=>call(worker,'actionChallenge',{action:'CREATE_CONSENT'}),/ONBOARDING_REQUIRED/);
  await call(replacement,'logout');assert.equal((await call(await auth(3),'dashboard')).passport.passportId,'2');assert.equal(app.session.stats.realProofs,0);
 }finally{await app.close();}
});
