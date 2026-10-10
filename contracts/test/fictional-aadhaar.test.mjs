import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFictionalAadhaarProvider,fictionalAadhaarIdentifiers} from '../local/fictional-aadhaar.mjs';
const personas=Object.fromEntries(Object.keys(fictionalAadhaarIdentifiers).map((name,index)=>[name,{id:name,identityNullifierHash:'0x'+'a'.repeat(63)+String(index+1)}]));
test('all seven fictional credentials resolve uniquely through the server provider',()=>{
 const provider=createFictionalAadhaarProvider({issueAssertion:p=>p},personas);
 assert.equal(new Set(Object.values(fictionalAadhaarIdentifiers)).size,7);
 for(const [name,identifier] of Object.entries(fictionalAadhaarIdentifiers)){
  assert.match(identifier,/^00000000000[1-7]$/);assert.equal(provider.resolve(identifier),personas[name]);
  const assertion=provider.issueAssertion(identifier,'wallet');assert.deepEqual(assertion,{workerIdentityNullifier:personas[name].identityNullifierHash,workerWalletAddress:'wallet'});
  assert.equal(JSON.stringify(assertion).includes(identifier),false);
 }
});
test('malformed, unknown, non-fictional and old persona inputs reject without echoing or invoking the signer',()=>{
 let issued=0;const provider=createFictionalAadhaarProvider({issueAssertion:()=>issued++},personas);
 for(const input of [undefined,null,123456789012,'','RAMESH','123','0000 0000 0001','000000000099','999999999999','000000000001extra']){
  assert.throws(()=>provider.issueAssertion(input,'wallet'),{message:'AADHAAR_IDENTIFIER_INVALID'});
 }
 assert.equal(issued,0);
});
