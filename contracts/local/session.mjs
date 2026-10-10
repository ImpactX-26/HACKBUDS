import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {id} from 'ethers';
import {deployLocal} from './deploy.mjs';
import {createProofEngine} from '../../circuits/service/engine.mjs';
import {createTrustedProver,localChainReader,protocolVersion,eligibilityProfile} from '../../circuits/service/trusted-prover.mjs';
import {createProvisionalPoseidon} from '../../circuits/dist/circuits/src/provisional-poseidon.js';
import {snapshot} from '../../circuits/scripts/eligibility-fixtures.mjs';
import {policyTypes,approvalTypes,domainFor} from '../proposal/authorization-v02.mjs';
import {createBackendClient,bundleVersion,consumerPolicies} from '../integration/client.mjs';
import {BackendError} from '../integration/errors.mjs';

/** Owns a persistent LOCAL synthetic session. No financial arrays are retained or exported.
 * Each resolver call regenerates the disposable fixture from its scenario and public metadata.
 */
export async function createSeededSession({port=0,application=false,profile=null}={}) {
  const local=await deployLocal({port,application,profile});
  let closed=false,closePromise;
  const jobs=new Set(),proofMetrics=[];
  const hashes=await createProvisionalPoseidon(),engine=createProofEngine(local.setup);
  const identity=id('B5_LOCAL_SYNTHETIC_IDENTITY');
  let fixture={passportId:1n,holderBinding:BigInt(local.addresses[2]),
    evidenceUpdatedAt:BigInt((await local.provider.getBlock('latest')).timestamp)-100n,evidenceDataHash:123456789n};
  let scenario='eligible',reads=0;
  const makeSnapshot=()=>snapshot({...fixture,...(scenario==='activity-fail'?{monthlyActivity:Array(36).fill(0n)}:{})});
  const evidence=s=>({commitment:hashes.commit(s).evidenceCommitment,updatedAt:s.evidenceUpdatedAt,schemaVersion:2,
    providerRef:id('B5_LOCAL_SYNTHETIC_PROVIDER'),sourceDirectoryVersion:s.sourceDirectoryVersion});
  try {
    if(!application){
      await (await local.passport.connect(local.signers[1]).mint(1,local.addresses[2],identity,evidence(makeSnapshot()))).wait();
      await (await local.token.transfer(local.addresses[2],100n*10n**6n)).wait();
    }
    const bundle={...structuredClone(local.manifest),bundleVersion,syntheticOnly:true,
      policyTypes:structuredClone(policyTypes),approvalTypes:structuredClone(approvalTypes),consumerPolicies:structuredClone(consumerPolicies),
      fixture:{passportId:'1',holder:local.addresses[2],identity,source:'LOCAL_SYNTHETIC_FIXTURE',evidenceHandle:'b5-synthetic-worker'},
      actors:{worker:local.addresses[2],replacement:local.addresses[3]},
      privateInterface:{kind:'trusted-in-process-or-parent-child-IPC',publicProofEndpoint:null}};
    for(const entry of Object.values(bundle.contracts))entry.abi=JSON.parse(readFileSync(entry.abi,'utf8'));
    const bundlePath=resolve(local.setup.directory,'integration-bundle.json');
    writeFileSync(bundlePath,JSON.stringify(bundle,null,2)+'\n');
    const readState=localChainReader({provider:local.provider,passport:local.passport,consumers:local.consumers,
      chainId:1337,mathVerifier:await local.math.getAddress()});
    const trackedEngine=async input=>{
      const started=performance.now(),job=engine(input);jobs.add(job);
      try {const result=await job;proofMetrics.push({seconds:(performance.now()-started)/1000,...result.metrics});return result;}
      finally {jobs.delete(job);}
    };
    const defaultReconstruct=async handle=>{
      if(handle!=='b5-synthetic-worker')throw Error('Unknown fixture handle');reads++;
      const state=await local.passport.getPassport(fixture.passportId);
      return {protocolVersion,eligibilityProfile,commitmentProfile:'gv-poseidon-hash-only-0.2.0',
        schemaVersion:'2',evidenceVersion:state.evidenceVersion.toString(),snapshot:makeSnapshot()};
    };
    // A supplies an authenticated resolver here; the caller cannot override it in a request.
    const createClient=({reconstruct=defaultReconstruct}={})=>createBackendClient({bundle,provider:local.provider,isClosed:()=>closed,
      prover:createTrustedProver({setupId:local.setup.id,hashes,readState,reconstruct,prove:trackedEngine})});
    const client=createClient();
    const fixtureSigner=actor=>{
      const index={worker:2,replacement:3,other:5}[actor];
      if(index===undefined)throw new BackendError('INVALID_ACTOR','Unknown synthetic local actor.');
      return local.signing(local.addresses[index]).connect(local.provider);
    };
    return {local,client,bundle,bundlePath,createClient,hashes,fixtureSigner,
      get stats(){return {evidenceReads:reads,realProofs:proofMetrics.length,proofMetrics:structuredClone(proofMetrics)};},
      fixtures:{
        // These explicit helpers are LOCAL test signers, not a general worker-signing endpoint.
        async signedRequest(consumer,{passportId=fixture.passportId.toString(),changes={}}={}) {
          if(closed)throw new BackendError('SESSION_CLOSED','The local session is closed.');
          if(!['loan','welfare','gate'].includes(consumer))throw new BackendError('REQUEST_UNSUPPORTED','Unknown consumer.');
          const now=BigInt((await local.provider.getBlock('latest')).timestamp);
          const base=consumerPolicies[consumer]??{incomeEnabled:'0',incomeWindowMonths:'0',minAverageIncomePaise:'0',activityEnabled:'0',
            activityIsWeekly:'0',activityWindow:'0',minActivePeriods:'0',historyEnabled:'0',minHistoryMonths:'0',maxEvidenceAgeDays:'30'};
          const policy={...base,expiresAt:(now+86400n).toString(),...changes,requestId:'0x'+randomBytes(32).toString('hex'),verifierId:local.addresses[4]};
          const verifierSignature=await local.signing(local.addresses[4]).signTypedData(domainFor(1337,bundle.contracts[consumer].address),policyTypes,policy);
          return {protocolVersion,eligibilityProfile,consumer,passportId:String(passportId),evidenceHandle:'b5-synthetic-worker',policy,verifierSignature};
        },
        async approve(request,actor='worker'){return client.approveRequest(request,fixtureSigner(actor));},
        async refresh(nextScenario='eligible') {
          if(closed)throw new BackendError('SESSION_CLOSED','The local session is closed.');
          if(!['eligible','activity-fail'].includes(nextScenario))throw new BackendError('INVALID_INPUT','Unknown synthetic fixture scenario.');
          const previousScenario=scenario,previous={...fixture};scenario=nextScenario;fixture.evidenceDataHash++;
          try {await (await local.passport.connect(local.signers[1]).refresh(fixture.passportId,evidence(makeSnapshot()))).wait();}
          catch(error){scenario=previousScenario;fixture=previous;throw error;}
          return client.getPassport(fixture.passportId.toString());
        },
        async recover() {
          if(closed)throw new BackendError('SESSION_CLOSED','The local session is closed.');
          await (await local.passport.revoke(fixture.passportId,'B5_LOCAL_SYNTHETIC_RECOVERY')).wait();
          await (await local.passport.authorizeReissue(identity)).wait();
          fixture={...fixture,passportId:await local.passport.nextPassportId(),holderBinding:BigInt(local.addresses[3]),evidenceDataHash:fixture.evidenceDataHash+1n};
          await (await local.passport.connect(local.signers[1]).mint(fixture.passportId,local.addresses[3],identity,evidence(makeSnapshot()))).wait();
          return client.getPassport(fixture.passportId.toString());
        }
      },
      async close(){if(closePromise)return closePromise;closed=true;
        closePromise=(async()=>{await Promise.allSettled([...jobs]);await local.close();})();return closePromise;}
    };
  }catch(error){await local.close();throw error;}
}
