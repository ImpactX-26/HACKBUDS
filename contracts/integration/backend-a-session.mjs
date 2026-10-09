import {randomUUID} from 'node:crypto';
import {prepareBackendASource} from './backend-a-source.mjs';
import {createBackendAPassportClient} from './backend-a-passport.mjs';
import {createSeededSession} from '../local/session.mjs';
import {translateBackendAWitness} from '../../circuits/service/backend-a-v1.mjs';
import {BackendError} from './errors.mjs';

/** LOCAL synthetic A services executing pinned upstream code, with a real B deployment.
 * No HTTP route, private evidence cache or implicit proof-policy approval. */
export async function createBackendAIntegration({sourceCommit}={}){
  const {manifest,importModule:load}=prepareBackendASource({commit:sourceCommit});
  const modules=await Promise.all(['backend/src/fip/storage','backend/src/fip/consent-service','backend/src/fip/fip-service',
    'backend/src/identity/mock-idp','backend/src/identity/wallet-auth','backend/src/evidence/attestation-service',
    'backend/src/evidence/commitment-adapter','backend/src/evidence/prover-boundary','backend/src/fip/personas/index',
    'backend/src/evidence/directory/registry','backend/src/evidence/fip-verifier'].map(load));
  const [{MockFIPStorage},{ConsentService},{MockFIPService},{MockIdentityProvider},auth,{AttestationService},
    {PoseidonEvidenceCommitmentAdapter},{buildProverWitnessPayload},{PERSONAS},{CURRENT_DIRECTORY_VERSION},{FIPVerifier}]=modules;
  const session=await createSeededSession();
  try{
    const worker=session.fixtureSigner('worker'),identity=PERSONAS.RAMESH.identityNullifierHash;
    const storage=new MockFIPStorage(),idp=new MockIdentityProvider(),consents=new ConsentService(storage,idp,true);
    const fip=new MockFIPService(storage,consents,'MOCK_APNA_BANK_FIP_01',idp,true);
    const replay=new auth.ReplayProtectionRegistry(new auth.MemoryReplayStore());
    const commitment=new PoseidonEvidenceCommitmentAdapter(),passportClient=createBackendAPassportClient(session);
    const attestation=new AttestationService(fip,[storage.getPublicKeyPem()],idp,replay,1337,commitment,passportClient);
    const handles=new Map();let reconstructionCalls=0;
    const issueAssertion=()=>idp.issueAssertion({workerIdentityNullifier:identity,workerWalletAddress:worker.address});
    const signAction=(action,consentId,passportId)=>auth.signWorkerAuthorization({action,consentId,expectedPassportId:passportId,
      workerWalletAddress:worker.address,chainId:1337},worker);
    const cutoff=Number((await session.local.provider.getBlock('latest')).timestamp)-100;
    const consent=consents.createConsent({accountId:PERSONAS.RAMESH.accountId,toTimestamp:cutoff,
      identityAssertion:issueAssertion(),walletAuthorization:await signAction('CREATE_CONSENT','',0)});
    const expectedId=await passportClient.getNextPassportId();
    // A performs the authenticated pipeline, computes A's Poseidon and submits via injected EVM client.
    const minted=await attestation.attestAndMintOnChain({consentId:consent.consentId,workerWalletAddress:worker.address,
      workerIdentityNullifier:identity,expectedPassportId:expectedId,sourceDirectoryVersion:CURRENT_DIRECTORY_VERSION,
      cutoffTimestamp:cutoff,identityAssertion:issueAssertion(),walletAuthorization:await signAction('MINT_PASSPORT',consent.consentId,expectedId)});
    const passportId=String(minted.passportId);
    delete minted.attestation; // Discard mint-time financial evidence; proofs must reconstruct afresh.
    const reconstruct=async handle=>{
      const authorization=handles.get(handle);if(!authorization)throw Error('Unknown/consumed private reconstruction capability');
      handles.delete(handle);reconstructionCalls++;
      const current=await session.client.getPassport(passportId);
      // A verifies consent, signatures, owner, action and replay, then reconstructs at chain cutoff/directory.
      const {snapshot}=attestation.reconstructEvidenceSnapshot({consentId:consent.consentId,workerWalletAddress:worker.address,
        workerIdentityNullifier:identity,passportId:Number(passportId),evidenceUpdatedAt:Number(current.evidenceUpdatedAt),
        sourceDirectoryVersion:Number(current.sourceDirectoryVersion),...authorization});
      const computed=await commitment.computeCommitment(snapshot);snapshot.evidenceCommitment=computed.evidenceCommitment;
      const payload=buildProverWitnessPayload(snapshot,computed.evidenceCommitment);
      return translateBackendAWitness(payload,{schemaVersion:current.schemaVersion,evidenceVersion:current.evidenceVersion},session.hashes);
    };
    const api=session.createClient({reconstruct});
    return {session,api,worker,passportId,identity,passportClient,sourceManifest:manifest,
      get reconstructionCalls(){return reconstructionCalls;},
      // Explicit caller-owned test signing tools; never invoked automatically by the resolver.
      signAction,issueAssertion,
      registerReconstruction({identityAssertion,walletAuthorization}){
        if(!identityAssertion||!walletAuthorization)throw new BackendError('A_AUTHORIZATION_REQUIRED','Explicit A identity assertion and reconstruction authorization are required.');
        const handle='a-b6-'+randomUUID();handles.set(handle,structuredClone({identityAssertion,walletAuthorization}));return handle;
      },
      async signedRequest(consumer,options={}){return {...await session.fixtures.signedRequest(consumer,{passportId,...options}),evidenceHandle:''};},
      async approve(request){return api.approveRequest(request,worker);},
      async refresh(){const now=Number((await session.local.provider.getBlock('latest')).timestamp);
        await attestation.refreshPassportEvidenceOnChain({consentId:consent.consentId,workerWalletAddress:worker.address,
          workerIdentityNullifier:identity,expectedPassportId:Number(passportId),cutoffTimestamp:now,
          sourceDirectoryVersion:CURRENT_DIRECTORY_VERSION,identityAssertion:issueAssertion(),
          walletAuthorization:await signAction('REFRESH_PASSPORT',consent.consentId,Number(passportId))},Number(passportId));
        return api.getPassport(passportId);},
      reconstruct,
      // Private owner inspection/test capabilities; no arrays are retained outside Mock FIP.
      upstream:{fip,storage,consents,attestation,replay,FIPVerifier,PERSONAS,consentId:consent.consentId},
      async close(){handles.clear();await session.close();}
    };
  }catch(error){await session.close();throw error;}
}
