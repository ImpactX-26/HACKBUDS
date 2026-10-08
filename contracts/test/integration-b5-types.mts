import {createBackendClient,type IntegrationBundle} from '../integration/client.mjs';
import type {AbstractProvider,Signer} from 'ethers';
import type {ProofRequest,ProofResult} from '../../circuits/service/trusted-prover.mjs';
declare const bundle:IntegrationBundle,provider:AbstractProvider,signer:Signer,request:ProofRequest,proof:ProofResult;
const client=createBackendClient({bundle,provider});
const status=await client.getPassport('1');
const directoryVersion:string=status.sourceDirectoryVersion;
await client.approveRequest(request,signer);await client.verify(request,proof);await client.borrow(request,proof,signer);
void directoryVersion;
// @ts-expect-error No financial snapshot is exposed through the public passport view.
status.snapshot;
// @ts-expect-error Transaction execution requires a caller-provided signer.
client.borrow(request,proof);
