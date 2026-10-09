import {createBackendClient,type IntegrationBundle} from '../integration/client.mjs';
import type {AbstractProvider,Signer} from 'ethers';
import type {ProofRequest,ProofResult} from '../../circuits/service/trusted-prover.mjs';
import {calculateGigScore,type GigScoreResult} from '../integration/gig-score.mjs';
import {createWorkerProofBridge} from '../integration/worker-proof-bridge.mjs';
const score:GigScoreResult=calculateGigScore({tenureMonths:18,weeksPaid:45,missedWeeks:7,averageMonthlyIncomePaise:'2400000'});
void score;
declare const bundle:IntegrationBundle,provider:AbstractProvider,signer:Signer,request:ProofRequest,proof:ProofResult;
const client=createBackendClient({bundle,provider});
const bridge=createWorkerProofBridge({client,authenticateWorker:async(context:{verifiedWallet:string})=>context.verifiedWallet});
await bridge.generateProof(request,{verifiedWallet:'0x0000000000000000000000000000000000000001'});
const status=await client.getPassport('1');
const directoryVersion:string=status.sourceDirectoryVersion;
await client.approveRequest(request,signer);await client.verify(request,proof);await client.borrow(request,proof,signer);
void directoryVersion;
// @ts-expect-error No financial snapshot is exposed through the public passport view.
status.snapshot;
// @ts-expect-error Transaction execution requires a caller-provided signer.
client.borrow(request,proof);
