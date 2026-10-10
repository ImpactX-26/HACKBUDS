import {fictionalAadhaarIdentifiers} from '../local/fictional-aadhaar.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {Wallet,BrowserProvider,getBytes,TypedDataEncoder,hexlify,toUtf8Bytes} from 'ethers';
import {createApplication} from '../local/app-session.mjs';
import {connectBrowserWallet} from '../../frontend/lib/browser-wallet.mjs';
process.env.GIGVAULT_LOCAL_SETUP_CACHE??=resolve('artifacts/demo-setup-cache');

// EIP-1193 test provider backed by an independent wallet and the actual local EVM.
// This exercises BrowserProvider and real signatures; it is NOT a MetaMask acceptance test.
test('independent EIP-1193 wallet authenticates, registers, consents and sends a mined transaction',async()=>{
 const app=await createApplication(),rpc=app.session.local.provider,wallet=Wallet.createRandom().connect(rpc),eth=new EventEmitter();
 eth.request=async({method,params=[]})=>{
  if(['eth_accounts','eth_requestAccounts'].includes(method))return [wallet.address];
  if(method==='wallet_switchEthereumChain'){assert.equal(params[0].chainId,'0x539');return null;}
  if(method==='eth_signTypedData_v4'){assert.equal(params[0].toLowerCase(),wallet.address.toLowerCase());const payload=JSON.parse(params[1]);const{EIP712Domain,...types}=payload.types;return wallet.signTypedData(payload.domain,types,payload.message);}
  if(method==='personal_sign'){assert.equal(params[1].toLowerCase(),wallet.address.toLowerCase());return wallet.signMessage(getBytes(params[0]));}
  if(method==='eth_sendTransaction'){const{from,...transaction}=params[0];assert.equal(from.toLowerCase(),wallet.address.toLowerCase());return (await wallet.sendTransaction(transaction)).hash;}
  return rpc.send(method,params);
 };
 const browser=new BrowserProvider(eth),call=(token,method,p={})=>app.dispatch(method,{...p,token});
 try{
  assert.ok(!app.bundle.devWallets.some(a=>a.address===wallet.address));
  assert.equal(await connectBrowserWallet(eth,app.bundle.rpcUrl),wallet.address);
  const signer=await browser.getSigner(),challenge=await app.dispatch('challenge',{wallet:wallet.address});
  const signature=await signer.signTypedData(challenge.domain,challenge.types,challenge.value);
  const{token}=await app.dispatch('login',{nonce:challenge.value.nonce,signature,connectionMode:'external'});
  await assert.rejects(()=>call(token,'localGas'),/ONBOARDING_REQUIRED/);
  const registration=await call(token,'onboardStart');await call(token,'onboardWallet',{sessionId:registration.sessionId,signature:await signer.signMessage(registration.message)});
  await call(token,'otpStart',{sessionId:registration.sessionId,phone:'+919000000001'});const otp=await call(token,'otpMailbox',{sessionId:registration.sessionId});
  await call(token,'otpVerify',{sessionId:registration.sessionId,code:otp.code});await call(token,'identityCommit',{sessionId:registration.sessionId,aadhaarNumber:fictionalAadhaarIdentifiers.RAMESH});
  for(const action of ['CREATE_CONSENT','MINT_PASSPORT']){const a=await call(token,'actionChallenge',{action});await call(token,'actionSubmit',{id:a.id,signature:await signer.signMessage(a.message)});}
  const d=await call(token,'dashboard');assert.equal(d.connectionMode,'external');assert.equal(d.passport.holderWallet,wallet.address);assert.equal(d.passport.status,'ACTIVE');
  const funded=await call(token,'localGas',{wallet:app.bundle.roles.admin,value:'999999999999999999999'});assert.equal(funded.status,1);assert.equal(await rpc.getBalance(wallet.address),250000000000000000n);
  await assert.rejects(()=>call(token,'localGas'),/LOCAL_GAS_ALREADY_FUNDED/);
  const transaction=await signer.sendTransaction({to:wallet.address,value:1n});const receipt=await transaction.wait();assert.equal(receipt.status,1);await call(token,'transactionMined',{hash:receipt.hash});
  assert.equal((await call(token,'dashboard')).wallet,wallet.address);
  const other=app.bundle.devWallets[3].address,otherChallenge=await app.dispatch('challenge',{wallet:other});
  const otherSignature=await rpc.send('eth_signTypedData_v4',[other,TypedDataEncoder.getPayload(otherChallenge.domain,otherChallenge.types,otherChallenge.value)]);
  const otherToken=(await app.dispatch('login',{nonce:otherChallenge.value.nonce,signature:otherSignature})).token;
  const otherRegistration=await call(otherToken,'onboardStart');
  await assert.rejects(()=>call(token,'otpMailbox',{sessionId:otherRegistration.sessionId}),/ONBOARDING_SESSION_REJECTED/);
  const otherMessage=m=>rpc.send('eth_sign',[other,hexlify(toUtf8Bytes(m))]);
  await call(otherToken,'onboardWallet',{sessionId:otherRegistration.sessionId,signature:await otherMessage(otherRegistration.message)});
  await call(otherToken,'otpStart',{sessionId:otherRegistration.sessionId,phone:'+919000000002'});const otherOtp=await call(otherToken,'otpMailbox',{sessionId:otherRegistration.sessionId});
  await call(otherToken,'otpVerify',{sessionId:otherRegistration.sessionId,code:otherOtp.code});await call(otherToken,'identityCommit',{sessionId:otherRegistration.sessionId,aadhaarNumber:fictionalAadhaarIdentifiers.SURESH});
  for(const action of ['CREATE_CONSENT','MINT_PASSPORT']){const a=await call(otherToken,'actionChallenge',{action});await call(otherToken,'actionSubmit',{id:a.id,signature:await otherMessage(a.message)});}
  const otherRequest=await call(otherToken,'applyService',{consumer:'loan'});
  await assert.rejects(()=>call(token,'approval',{id:otherRequest.id}),/UNAUTHORIZED_WORKER/);
  await assert.rejects(()=>call(token,'consumerTransaction',{id:otherRequest.id}),/UNAUTHORIZED_WORKER/);
  const privateAction=await call(otherToken,'actionChallenge',{action:'FETCH_FINANCIAL_DATA'});
  await assert.rejects(async()=>call(token,'actionSubmit',{id:privateAction.id,signature:await signer.signMessage(privateAction.message)}),/ACTION_EXPIRED/);
  assert.equal((await call(token,'dashboard',{wallet:other})).worker.name,'Ramesh Kumar');
 }finally{browser.destroy();await app.close();}
});
