// Server-only evaluation namespace; never issue credentials from arbitrary input.
// Zero-prefixed identifiers are fictional, not Aadhaar numbers. Values are not stored.
export const fictionalAadhaarIdentifiers=Object.freeze({
 RAMESH:'000000000001',SURESH:'000000000002',IMRAN:'000000000003',
 MANJUNATH:'000000000004',VENKATESH:'000000000005',FARHAN:'000000000006',ARJUN:'000000000007'
});
export function createFictionalAadhaarProvider(idp,personas){
 const identities=new Map(Object.entries(fictionalAadhaarIdentifiers).map(([name,identifier])=>[identifier,personas[name]]));
 const resolve=identifier=>{
  if(typeof identifier!=='string'||!/^\d{12}$/.test(identifier)||!identities.has(identifier)||!identities.get(identifier))throw Error('AADHAAR_IDENTIFIER_INVALID');
  return identities.get(identifier);
 };
 return {resolve,issueAssertion(identifier,wallet){const persona=resolve(identifier);
  return idp.issueAssertion({workerIdentityNullifier:persona.identityNullifierHash.toLowerCase(),workerWalletAddress:wallet});
 }};
}
