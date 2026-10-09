import assert from 'node:assert/strict';
import {JsonRpcProvider,TypedDataEncoder,verifyTypedData} from 'ethers';
import {writeFileSync} from 'node:fs';
const origin=process.env.GIGVAULT_APP_ORIGIN || 'http://localhost:3200';
const results=[];
async function call(path,body,cookie,customOrigin=origin){
  const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:customOrigin,
    'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};
}
const session=await call('/api/backend/session');assert.equal(session.body.ok,true);
const holder=session.body.passport.holderWallet;
for(const path of ['prove','claim','borrow','repay']){
  const r=await call('/api/backend/'+path,{passportId:'1',workerWallet:holder});
  assert.equal(r.status,401);results.push(`unauthenticated ${path} rejects copied public holder address`);
}
const wrongOrigin=await call('/api/backend/auth/challenge',{},undefined,'http://untrusted.invalid');
assert.equal(wrongOrigin.status,403);results.push('cross-origin challenge rejected');
const forged=await call('/api/backend/auth/challenge',{});
const bad=await call('/api/backend/auth/verify',{nonce:forged.body.challenge.value.nonce,signature:'0x'+'ff'.repeat(65)});
assert.equal(bad.status,401);results.push('fabricated login signature rejected');
const challenge=await call('/api/backend/auth/challenge',{}),c=challenge.body.challenge;
const provider=new JsonRpcProvider(session.body.rpcUrl);
try{
  // Same actual local RPC signing mechanism used by the browser's labelled dev mode.
  const signature=await provider.send('eth_signTypedData_v4',[holder,TypedDataEncoder.getPayload(c.domain,c.types,c.value)]);
  assert.equal(verifyTypedData(c.domain,c.types,c.value,signature).toLowerCase(),holder.toLowerCase());
  const login=await call('/api/backend/auth/verify',{nonce:c.value.nonce,signature});assert.equal(login.status,200);
  assert.match(login.cookie,/HttpOnly/i);assert.match(login.cookie,/SameSite=strict/i);results.push('real wallet login creates HttpOnly strict cookie');
  const replay=await call('/api/backend/auth/verify',{nonce:c.value.nonce,signature});assert.equal(replay.status,401);results.push('login nonce replay rejected');
  const policy=await call('/api/backend/policy?consumer=loan');assert.equal(policy.body.policyRequest.workerSignature,undefined);
  assert.equal(Number(policy.body.approval.domain.chainId),1337);
  assert.equal(policy.body.approval.value.passportId,'1');
  assert.equal(policy.body.approval.value.evidenceCommitment,session.body.passport.evidenceCommitment);
  const cookie=login.cookie.split(';')[0];
  const approvalSignature=await provider.send('eth_signTypedData_v4',[holder,TypedDataEncoder.getPayload(policy.body.approval.domain,policy.body.approval.types,policy.body.approval.value)]);
  assert.equal(verifyTypedData(policy.body.approval.domain,policy.body.approval.types,policy.body.approval.value,approvalSignature).toLowerCase(),holder.toLowerCase());
  results.push('exact live worker approval is genuinely signed; policy endpoint never approves');
  const rejected=await call('/api/backend/prove',{request:{...policy.body.policyRequest,workerSignature:'0x'+'ff'.repeat(65)}},cookie);
  assert.equal(rejected.body.ok,false);assert.equal(rejected.body.code,'WORKER_APPROVAL_INVALID');results.push('authenticated caller still cannot use dummy approval');
}finally{provider.destroy();}
writeFileSync('reports/frontend-auth-http.json',JSON.stringify({localOnly:true,syntheticOnly:true,origin,passed:results.length,results},null,2)+'\n');
console.log(`${results.length} actual HTTP checks passed`);
