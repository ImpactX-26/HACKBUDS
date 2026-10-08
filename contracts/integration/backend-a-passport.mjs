import {BackendError} from './errors.mjs';
const number=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0||BigInt(n)!==BigInt(value))
  throw new BackendError('A_INTEGER_UNSUPPORTED','Backend A requires a safe integer here.');return n;};
/** Injected IGigPassportClient transport. Actual EVM; A owns attestation and authorization. */
export function createBackendAPassportClient(session){
  const {passport,signers}=session.local,receipts=[];
  async function send(method,args,signer){
    const contract=passport.connect(signer);
    try{await contract[method].staticCall(...args);const r=await(await contract[method](...args)).wait();
      receipts.push({action:method,hash:r.hash,status:r.status,blockNumber:r.blockNumber});return r;}
    catch(error){let parsed;try{parsed=passport.interface.parseError(error.data??error.info?.error?.data?.result);}catch{}
      // A's orchestrator recognizes this name and requires a fresh worker authorization.
      if(parsed)throw new BackendError(parsed.name,parsed.name);throw new BackendError('CHAIN_TRANSACTION_FAILED','Local passport transaction failed.');}
  }
  const convert=p=>Object.fromEntries(Object.entries(p).map(([k,v])=>[k,
    ['passportId','evidenceVersion','evidenceUpdatedAt','issuedAt','schemaVersion','supersedes','sourceDirectoryVersion'].includes(k)?number(v):v]));
  return {isMockClient:false,localOnly:true,receipts,
    getNextPassportId:async()=>number(await session.client.getNextPassportId()),
    getActivePassportByIdentity:async identity=>number(await session.client.getActivePassportByIdentity(identity)),
    isReissueAllowed:identity=>session.client.isReissueAllowed(identity),
    async getPassport(id){try{return convert(await session.client.getPassport(String(id)));}
      catch(e){if(e.code==='PASSPORT_NOT_FOUND')return null;throw e;}},
    async mint(expectedId,holder,identity,evidence){await send('mint',[expectedId,holder,identity,evidence],signers[1]);return number(expectedId);},
    async refresh(id,evidence){await send('refresh',[id,evidence],signers[1]);},
    async revoke(id,reason){await send('revoke',[id,reason],signers[0]);},
    async authorizeReissue(identity){await send('authorizeReissue',[identity],signers[0]);}
  };
}
