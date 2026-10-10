import {fictionalAadhaarIdentifiers} from '../local/fictional-aadhaar.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {TypedDataEncoder,hexlify,toUtf8Bytes} from 'ethers';
import {createApplication} from '../local/app-session.mjs';
process.env.GIGVAULT_LOCAL_SETUP_CACHE??=resolve('artifacts/demo-setup-cache');

test('worker access requires wallet, phone OTP and identity; returning accounts require a fresh wallet challenge',async()=>{
 const app=await createApplication(),rpc=app.session.local.provider,wallet=app.bundle.devWallets[2].address;
 const call=(token,m,p={})=>app.dispatch(m,{...p,token});
 async function connect(account=wallet){const a=await app.dispatch('challenge',{wallet:account});const signature=await rpc.send('eth_signTypedData_v4',[account,TypedDataEncoder.getPayload(a.domain,a.types,a.value)]);return (await app.dispatch('login',{nonce:a.value.nonce,signature})).token;}
 try{
  const token=await connect();let d=await call(token,'dashboard');assert.equal(d.role,'pending');assert.equal(d.authentication,'ONBOARDING_REQUIRED');assert.equal(d.worker,null);
  await assert.rejects(()=>call(token,'actionChallenge',{action:'CREATE_CONSENT'}),/ONBOARDING_REQUIRED/);
  const s=await call(token,'onboardStart');const signature=await rpc.send('eth_sign',[wallet,hexlify(toUtf8Bytes(s.message))]);await call(token,'onboardWallet',{sessionId:s.sessionId,signature});
  await assert.rejects(()=>call(token,'identityCommit',{sessionId:s.sessionId,aadhaarNumber:fictionalAadhaarIdentifiers.RAMESH}),/PHONE_VERIFICATION_REQUIRED/);
  await assert.rejects(()=>call(token,'otpMailbox',{sessionId:s.sessionId}),/OTP_NOT_ACTIVE/);
  await call(token,'otpStart',{sessionId:s.sessionId,phone:'+919000000001'});const otp=await call(token,'otpMailbox',{sessionId:s.sessionId});assert.match(otp.code,/^\d{6}$/);
  await assert.rejects(()=>call(token,'otpStart',{sessionId:s.sessionId,phone:'+919000000001'}),/CooldownActive/);
  assert.equal((await call(token,'otpMailbox',{sessionId:s.sessionId})).code,otp.code);
  assert.equal((await call(token,'dashboard')).onboarding.sessionId,s.sessionId);
  await assert.rejects(()=>call(token,'otpVerify',{sessionId:s.sessionId,code:'000000'}),/InvalidOtpCode/);
  await call(token,'otpVerify',{sessionId:s.sessionId,code:otp.code});assert.equal((await call(token,'dashboard')).role,'pending');
  for(const aadhaarNumber of ['123','999999999999','000000000099',123456789012])await assert.rejects(()=>call(token,'identityCommit',{sessionId:s.sessionId,aadhaarNumber}),/AADHAAR_IDENTIFIER_INVALID/);
  await assert.rejects(()=>call(token,'identityCommit',{sessionId:s.sessionId,persona:'RAMESH'}),/AADHAAR_IDENTIFIER_INVALID/);
  assert.equal((await call(token,'dashboard')).onboarding.state,'PHONE_VERIFIED');
  const otherWallet=app.bundle.devWallets[3].address,other=await connect(otherWallet);
  await assert.rejects(()=>call(other,'identityCommit',{sessionId:s.sessionId,aadhaarNumber:fictionalAadhaarIdentifiers.RAMESH}),/ONBOARDING_SESSION_REJECTED/);
  await call(token,'identityCommit',{sessionId:s.sessionId,aadhaarNumber:fictionalAadhaarIdentifiers.RAMESH});assert.equal((await call(token,'dashboard')).authentication,'COMPLETE');
  const duplicate=await call(other,'onboardStart');await call(other,'onboardWallet',{sessionId:duplicate.sessionId,signature:await rpc.send('eth_sign',[otherWallet,hexlify(toUtf8Bytes(duplicate.message))])});
  await call(other,'otpStart',{sessionId:duplicate.sessionId,phone:'+919000000002'});const otherOtp=await call(other,'otpMailbox',{sessionId:duplicate.sessionId});await call(other,'otpVerify',{sessionId:duplicate.sessionId,code:otherOtp.code});
  await assert.rejects(()=>call(other,'identityCommit',{sessionId:duplicate.sessionId,aadhaarNumber:fictionalAadhaarIdentifiers.RAMESH}),/IDENTITY_ALREADY_BOUND/);
  assert.equal((await call(other,'dashboard')).role,'pending');
  await call(token,'logout');await assert.rejects(()=>call(token,'dashboard'),/session/);
  const next=await connect();d=await call(next,'dashboard');assert.equal(d.authentication,'COMPLETE');assert.equal(d.role,'worker');assert.equal(d.worker.name,'Ramesh Kumar');
  await assert.rejects(()=>call(next,'loginOtpStart',{phone:'+919000000001'}),/PHONE_LOGIN_NOT_REQUIRED/);
  async function signedAction(action){const a=await call(next,'actionChallenge',{action});const signature=await rpc.send('eth_sign',[wallet,hexlify(toUtf8Bytes(a.message))]);return call(next,'actionSubmit',{id:a.id,signature});}
  await assert.rejects(()=>signedAction('FETCH_FINANCIAL_DATA'),/CONSENT_REQUIRED/);
  await signedAction('CREATE_CONSENT');const evidence=await signedAction('FETCH_FINANCIAL_DATA');
  assert.equal(evidence.authenticated,true);assert.ok(evidence.total>evidence.rows.length);assert.ok(evidence.counted>0);assert.ok(evidence.rows.some(x=>x.category!=='COUNTED'));assert.equal(evidence.rows[0].raw,undefined);
  await signedAction('MINT_PASSPORT');const minted=await call(next,'dashboard');
  const reconstruction=await call(next,'actionChallenge',{action:'RECONSTRUCT_EVIDENCE',requestId:'not-approved'});
  assert.equal(reconstruction.scope.cutoff,Number(minted.passport.evidenceUpdatedAt));
  const verifierChallenge=await app.dispatch('challenge',{wallet:app.bundle.roles.verifier});const verifierSignature=await rpc.send('eth_signTypedData_v4',[app.bundle.roles.verifier,TypedDataEncoder.getPayload(verifierChallenge.domain,verifierChallenge.types,verifierChallenge.value)]);
  const verifierToken=(await app.dispatch('login',{nonce:verifierChallenge.value.nonce,signature:verifierSignature})).token;
  await assert.rejects(()=>call(verifierToken,'actionChallenge',{action:'FETCH_FINANCIAL_DATA'}),/ONBOARDING_REQUIRED/);
  await call(next,'revokeConsent');await assert.rejects(()=>signedAction('FETCH_FINANCIAL_DATA'),/revoked/);
 }finally{await app.close();}
});
