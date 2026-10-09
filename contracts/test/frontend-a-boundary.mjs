import assert from 'node:assert/strict';
import {JsonRpcProvider,TypedDataEncoder} from 'ethers';
import {writeFileSync} from 'node:fs';
const origin='http://localhost:3000',checks=[];
async function call(path,body,cookie,source=origin){const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:source,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};}
const session=(await call('/api/backend/session')).body;assert.equal(session.evidenceSource.mode,'backend-a-http');
for(const name of ['prove','claim','borrow','repay','onboarding','reconstruction']){const r=await call('/api/backend/'+name,{workerWallet:session.passport.holderWallet});assert.equal(r.status,401);checks.push(name+' rejects unauthenticated copied holder');}
assert.equal((await call('/api/backend/auth/challenge',{},undefined,'http://untrusted.invalid')).status,403);checks.push('wrong origin rejected');
const challenge=(await call('/api/backend/auth/challenge',{})).body.challenge;
assert.equal((await call('/api/backend/auth/verify',{nonce:challenge.value.nonce,signature:'0x'+'ff'.repeat(65)})).status,401);checks.push('fabricated wallet signature rejected');
const fresh=(await call('/api/backend/auth/challenge',{})).body.challenge,provider=new JsonRpcProvider(session.rpcUrl);
try{const signature=await provider.send('eth_signTypedData_v4',[session.passport.holderWallet,TypedDataEncoder.getPayload(fresh.domain,fresh.types,fresh.value)]);
 const login=await call('/api/backend/auth/verify',{nonce:fresh.value.nonce,signature});assert.equal(login.status,200);assert.match(login.cookie,/HttpOnly/);checks.push('real A-passport holder login');
 assert.equal((await call('/api/backend/auth/verify',{nonce:fresh.value.nonce,signature})).status,401);checks.push('login replay rejected');
 const p=(await call('/api/backend/policy?consumer=loan')).body;assert.equal(p.policyRequest.passportId,session.passport.passportId);
 const before=(await call('/api/backend/session')).body.pipeline.aReconstructionCalls;
 const rejected=await call('/api/backend/prove',{request:{...p.policyRequest,workerSignature:'0x'+'ff'.repeat(65)}},login.cookie.split(';')[0]);assert.equal(rejected.body.code,'WORKER_APPROVAL_INVALID');checks.push('forged policy approval rejected');
 assert.equal((await call('/api/backend/session')).body.pipeline.aReconstructionCalls,before);checks.push('rejection precedes A private evidence read');
}finally{provider.destroy();}
writeFileSync('reports/frontend-a-boundary.json',JSON.stringify({passed:checks.length,checks,localOnly:true,commit:session.evidenceSource.commit,passportId:session.passport.passportId},null,2));console.log(checks.length+' A-connected HTTP boundary checks passed');
