import assert from 'node:assert/strict';
const origin=process.env.GIGVAULT_APP_ORIGIN??'http://localhost:3000';
async function call(action,body={},requestOrigin=origin){
 const response=await fetch(origin+'/api/app/'+action,{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
}
assert.equal((await call('phoneStart',{purpose:'create',phone:'+919000000099'},'http://untrusted.invalid')).status,403);
assert.equal((await call('phoneIdentity',{flowToken:'forged',aadhaarNumber:'000000000006'})).status,401);
assert.equal((await call('phoneMailbox',{flowToken:'forged'})).status,401);
assert.equal((await call('dashboard',{token:'forged'})).status,401);
assert.equal((await call('managedTransaction',{token:'forged',kind:'repay'})).status,401);
assert.equal((await call('sign',{message:'arbitrary'})).status,404);
assert.equal((await call('login',{connectionMode:'managed'})).body.error,'MANAGED_SESSION_REQUIRED');
const info=await call('info');assert.equal(info.body.localPhoneAuthentication,true);assert.doesNotMatch(JSON.stringify(info.body),/privateKey|mnemonic/);assert.equal(info.cache,'no-store');
console.log('8 actual HTTP boundary checks passed');
