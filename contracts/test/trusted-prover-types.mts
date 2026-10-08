import {createTrustedProver, type ProofRequest, type EvidenceEnvelope, type TrustedState} from '../../circuits/service/trusted-prover.mjs';
declare const request: ProofRequest;
declare const state: TrustedState;
declare const envelope: EvidenceEnvelope;
const service=createTrustedProver({setupId:'typecheck-only',readState:async()=>state,
  reconstruct:async()=>envelope,hashes:{commit:()=>({evidenceCommitment:1n})},
  prove:async()=>({proof:{pi_a:[],pi_b:[],pi_c:[],protocol:'groth16',curve:'bn128'},publicSignals:[]})});
const result=await service.prove(request);
const publicSignals: string[]=result.solidity.signals;
void publicSignals;
// @ts-expect-error No private evidence may be returned through the typed interface.
result.snapshot;
