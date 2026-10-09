import type {BackendClient} from './client.mjs';
import type {ProofRequest,ProofResult} from '../../circuits/service/trusted-prover.mjs';
export declare function createWorkerProofBridge<Context>(config:{
  client:Pick<BackendClient,'getPassport'|'generateProof'>;
  authenticateWorker:(context:Context)=>Promise<string>|string;
}):{generateProof(request:ProofRequest,serverContext:Context):Promise<ProofResult>};
