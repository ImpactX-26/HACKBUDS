import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JsonRpcProvider,TypedDataEncoder} from 'ethers';
const origin=process.env.GIGVAULT_APP_ORIGIN??'http://localhost:3000';
async function call(action,p={},cookie='',requestOrigin=origin){const r=await fetch(origin+'/api/app/'+action,{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(p)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')};}
test('connected HTTP boundary: origin, cookie ownership, private data and retired APIs',async()=>{
 assert.equal((await call('dashboard')).status,401);
 assert.equal((await call('info',{},'','https://attacker.invalid')).status,403);
 const info=(await call('info')).value,rpc=new JsonRpcProvider(info.rpcUrl),wallet=info.roles.verifier;
 try{
  const challenge=(await call('challenge',{wallet})).value;
  const signature=await rpc.send('eth_signTypedData_v4',[wallet,TypedDataEncoder.getPayload(challenge.domain,challenge.types,challenge.value)]);
  const login=await call('login',{nonce:challenge.value.nonce,signature});assert.equal(login.status,200);assert.ok(login.cookie.includes('HttpOnly'));assert.equal(login.value.token,undefined);
  assert.equal((await call('login',{nonce:challenge.value.nonce,signature})).status,401);
  const cookie=login.cookie.split(';')[0],dashboard=await call('dashboard',{wallet:info.devWallets[2].address,token:'attacker'},cookie);
  assert.equal(dashboard.status,200);assert.equal(dashboard.value.wallet,wallet);assert.equal(dashboard.value.worker,null);assert.equal(dashboard.value.summary,null);
  const output=JSON.stringify(dashboard.value);for(const field of ['monthlyGigIncomeTotals','weeklyActivity','phoneHash','privateKey','identityAssertion','walletAuthorization','witness'])assert.ok(!output.includes(field));
  assert.equal((await call('otpMailbox',{sessionId:'other-worker'},cookie)).status,400);
  assert.equal((await call('adminTransaction',{passportId:'1'},cookie)).status,400);
  assert.equal((await call('generateWitness',{},cookie)).status,404);
  assert.equal((await fetch(origin+'/api/backend/borrow',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,410);
  const old=await fetch(origin+'/live',{redirect:'manual'});assert.equal(old.status,307);
  const missing=await call('publicPassport',{passportId:'999999'});assert.equal(missing.status,400);assert.equal(missing.value.status,undefined);
  await call('logout',{},cookie);assert.equal((await call('dashboard',{},cookie)).status,401);
  const worker=info.devWallets[3].address,bootstrap=(await call('challenge',{wallet:worker})).value;
  const workerSignature=await rpc.send('eth_signTypedData_v4',[worker,TypedDataEncoder.getPayload(bootstrap.domain,bootstrap.types,bootstrap.value)]);
  const preliminary=await call('login',{nonce:bootstrap.value.nonce,signature:workerSignature}),workerCookie=preliminary.cookie.split(';')[0];
  const pending=await call('dashboard',{},workerCookie);assert.equal(pending.value.role,'pending');assert.equal(pending.value.worker,null);assert.equal(pending.value.summary,null);
  assert.equal((await call('actionChallenge',{action:'CREATE_CONSENT'},workerCookie)).status,400);
  assert.equal((await call('consumerTransaction',{id:'forged'},workerCookie)).status,400);
  await call('logout',{},workerCookie);
 }finally{rpc.destroy();}
});
