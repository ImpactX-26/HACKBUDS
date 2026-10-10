import {randomBytes,createHash} from 'node:crypto';
import {getAddress,id,verifyTypedData} from 'ethers';
import {BackendError} from './errors.mjs';
export const localLoginTypes={LocalWorkerLogin:[
  {name:'workerWallet',type:'address'},{name:'nonce',type:'bytes32'},
  {name:'originHash',type:'bytes32'},{name:'expiresAt',type:'uint256'}]};
const fail=()=>{throw new BackendError('AUTHENTICATION_REQUIRED','A valid wallet-signed local session is required.');};
const tokenHash=token=>createHash('sha256').update(token).digest('hex');
/** Local application authentication only. Not a new shared financial/proof format.
 * Nonces and hashed sessions stay in memory; expiry uses wall time, not fixture time.
 */
export function createLocalWalletAuth({domain,origin,now=()=>Math.floor(Date.now()/1000)}){
  const challenges=new Map(),sessions=new Map();
  const cleanup=()=>{for(const map of [challenges,sessions])for(const [k,v]of map)if(v.expiresAt<=now())map.delete(k);};
  return Object.freeze({
    challenge(workerWallet){cleanup();if(challenges.size>=128)throw new BackendError('AUTH_BUSY','Retry shortly.');
      const wallet=getAddress(workerWallet),nonce='0x'+randomBytes(32).toString('hex'),expiresAt=now()+120;
      const value={workerWallet:wallet,nonce,originHash:id(origin),expiresAt:String(expiresAt)};
      challenges.set(nonce,{wallet,expiresAt,value});return {domain:structuredClone(domain),types:structuredClone(localLoginTypes),value};
    },
    login(nonce,signature,connectionMode='external'){cleanup();const c=challenges.get(nonce);if(!c)fail();
      challenges.delete(nonce);let recovered;
      try{recovered=getAddress(verifyTypedData(domain,localLoginTypes,c.value,signature));}catch{fail();}
      if(recovered!==c.wallet)fail();if(sessions.size>=128)throw new BackendError('AUTH_BUSY','Retry shortly.');
      const token=randomBytes(32).toString('base64url'),expiresAt=now()+1800;
      sessions.set(tokenHash(token),{wallet:c.wallet,expiresAt,connectionMode:['local','managed'].includes(connectionMode)?connectionMode:'external'});return {token,workerWallet:c.wallet,expiresAt};
    },
    authenticate(token){cleanup();if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))fail();
      const session=sessions.get(tokenHash(token));if(!session)fail();return session.wallet;
    },
    connectionMode(token){this.authenticate(token);return sessions.get(tokenHash(token)).connectionMode;},
    logout(token){if(typeof token==='string')sessions.delete(tokenHash(token));},
    expiresAt(token){cleanup();const s=typeof token==='string'&&sessions.get(tokenHash(token));if(!s)fail();return s.expiresAt;},
    close(){challenges.clear();sessions.clear();}
  });
}
