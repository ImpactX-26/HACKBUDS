import {getAddress} from 'ethers';
import {BackendError} from './errors.mjs';
/** Backend-only composition, not an HTTP listener or an authentication provider.
 * authenticateWorker must verify server-owned session/wallet authentication.
 * Never forward the fixture signing/controller methods through a browser route.
 */
export function createWorkerProofBridge({client,authenticateWorker}) {
  if(typeof authenticateWorker!=='function'||typeof client?.getPassport!=='function'||typeof client?.generateProof!=='function')
    throw new TypeError('A trusted authentication callback and backend client are required');
  return Object.freeze({async generateProof(request,serverContext) {
    const captured=structuredClone(request);
    let wallet;
    try{wallet=getAddress(await authenticateWorker(serverContext));}
    catch{throw new BackendError('AUTHENTICATION_REQUIRED','Authenticate the current worker wallet first.');}
    const passport=await client.getPassport(captured.passportId);
    if(getAddress(passport.holderWallet)!==wallet)
      throw new BackendError('UNAUTHORIZED_WORKER','The authenticated wallet is not the current passport holder.');
    // Existing SDK/prover checks still verify exact signed policy, worker approval,
    // current state and evidence before the private reconstruction capability runs.
    return client.generateProof(captured);
  }});
}
