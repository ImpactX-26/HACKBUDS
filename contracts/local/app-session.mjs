import {resolve} from 'node:path';
import {openApplicationProfile} from './application-profile.mjs';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {getAddress,verifyTypedData} from 'ethers';
import {createSeededSession} from './session.mjs';
import {cacheApplicationSetup} from './setup.mjs';
import {prepareBackendASource} from '../integration/backend-a-source.mjs';
import {createBackendAPassportClient} from '../integration/backend-a-passport.mjs';
import {createLocalWalletAuth} from '../integration/local-wallet-auth.mjs';
import {domainFor,policyTypes,validatePolicy} from '../proposal/authorization-v02.mjs';
import {consumerPolicies} from '../integration/client.mjs';
import {translateBackendAWitness} from '../../circuits/service/backend-a-v1.mjs';

const now=()=>Math.floor(Date.now()/1000);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const same=(a,b)=>a?.toLowerCase()===b?.toLowerCase();
const clean=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v));

/** Local application controller. Only its owning parent has access to private IPC.
 * No raw evidence/witness endpoint. All authority comes from verified wallet signatures.
 * Loopback Ganache accounts are intentionally unlocked development wallets, never production keys. */
export async function createApplication({port=0,origin='http://localhost:3000',dataDirectory}={}){
  const profile=openApplicationProfile(dataDirectory);let session;
  try{
    session=await createSeededSession({port,application:true,profile});
    const saved=profile?.read('accounts.json');
    if(saved&&(saved.version!==1||!['registry','workers','consents','requests'].every(k=>Array.isArray(saved[k]))||typeof saved.phoneSecret!=='string'||!saved.idpKey?.privateKeyPem||!saved.fipKey?.privateKeyPem))throw Error('APPLICATION_ACCOUNT_STATE_INVALID');
    cacheApplicationSetup(session.local.setup);
    const {manifest,importModule:load}=prepareBackendASource();
    const paths=['fip/storage','fip/consent-service','fip/fip-service','identity/mock-idp','identity/wallet-auth',
      'evidence/attestation-service','evidence/commitment-adapter','evidence/prover-boundary','fip/personas/index',
      'evidence/directory/registry','identity/onboarding/registry','identity/onboarding/session-service',
      'identity/phone/mock-provider','identity/aadhaar/mock-verifier'];
    const [{MockFIPStorage},{ConsentService},{MockFIPService},{MockIdentityProvider},auth,{AttestationService},
      {PoseidonEvidenceCommitmentAdapter},{buildProverWitnessPayload},{PERSONAS},{CURRENT_DIRECTORY_VERSION},
      {WorkerOnboardingRegistry},{OnboardingSessionService,formatOnboardingChallengeMessage},
      {MockPhoneVerificationProvider},{MockAadhaarVerifier}]=await Promise.all(paths.map(p=>load('backend/src/'+p)));
    const local=session.local,bundle=session.bundle;
    const [{FIPVerifier},{TransactionClassifier}]=await Promise.all(['evidence/fip-verifier','evidence/classifier'].map(p=>load('backend/src/'+p)));
    // Application deployments begin empty; the old seeded demo remains a separate mode.
    delete bundle.fixture;delete bundle.actors;
    bundle.application=true;bundle.persistentAccounts=!!profile;bundle.evidenceSource={mode:'SYNTHETIC_MOCK_IDP_SIGNED_FIP',commit:manifest.commit,
      transport:'private-parent-child-IPC',realAadhaarAvailable:false};
    const accounts=await local.provider.listAccounts();
    bundle.devWallets=await Promise.all(accounts.map(async(a,index)=>({address:await a.getAddress(),
      label:index===0?'Administrator':index===1?'Attester (service only)':index===4?'Verifier':'Worker '+index})));
    const login=createLocalWalletAuth({origin,domain:{name:'GigVaultLocalSession',version:'1',chainId:1337,
      verifyingContract:bundle.contracts.passport.address}});
    const registry=new WorkerOnboardingRegistry(),recoveryRegistry=new WorkerOnboardingRegistry();
    const phoneSecret=saved?.phoneSecret??randomBytes(32).toString('hex');
    const phone=new MockPhoneVerificationProvider({hmacSecret:phoneSecret,allowDevTestRetrieval:true});
    const idp=new MockIdentityProvider(saved?.idpKey),recoveryIdp=new MockIdentityProvider();
    registry.recordsByWorkerId=new Map(saved?.registry??[]);
    for(const record of await registry.listActiveWorkers())idp.rebindWorkerWallet(record.identityNullifier,record.walletAddress);
    const onboarding=new OnboardingSessionService({registry,phoneProvider:phone,phoneHmacSecret:phoneSecret,
      mockAadhaarVerifier:new MockAadhaarVerifier(idp)});
    const recoveryOnboarding=new OnboardingSessionService({registry:recoveryRegistry,phoneProvider:phone,phoneHmacSecret:phoneSecret,
      mockAadhaarVerifier:new MockAadhaarVerifier(recoveryIdp)});
    const storage=new MockFIPStorage(saved?.fipKey);storage.consents=new Map(saved?.consents??[]);
    const consents=new ConsentService(storage,idp,true);
    const sourceVerifier=new FIPVerifier([storage.getPublicKeyPem()]);
    const fip=new MockFIPService(storage,consents,'MOCK_APNA_BANK_FIP_01',idp,true);
    const replay=new auth.ReplayProtectionRegistry(profile?new auth.FileReplayStore(resolve(profile.root,'replay.json')):new auth.MemoryReplayStore());
    const commitment=new PoseidonEvidenceCommitmentAdapter(),passportClient=createBackendAPassportClient(session);
    const attestation=new AttestationService(fip,[storage.getPublicKeyPem()],idp,replay,1337,commitment,passportClient);
    const workers=new Map(saved?.workers??[]),onboards=new Map(),actions=new Map(),requests=new Map(saved?.requests??[]),recoveries=new Map();
    for(const r of requests.values())if(r.status==='PROVING'){r.status='APPROVED';r.proof=null;}
    const persist=()=>profile?.write('accounts.json',{version:1,phoneSecret,idpKey:idp.keyPair,fipKey:storage.getKeyPair(),
      registry:[...registry.recordsByWorkerId],workers:[...workers],consents:[...storage.consents],requests:[...requests]});
    persist();
    const verifiedSessions=new Map(),loginOtps=new Map();
    const sessionKey=token=>createHash('sha256').update(token).digest('hex');
    const completeLogin=token=>verifiedSessions.set(sessionKey(token),{expiresAt:now()+1800});
    const expiry=()=>{
      for(const map of [actions,onboards,recoveries,verifiedSessions,loginOtps])for(const[k,v]of map)if(v.expiresAt<=now())map.delete(k);
      for(const[id,r]of requests)if(r.expiresAt<now()-90*86400)requests.delete(id);
      for(const r of requests.values())if(r.expiresAt<=now()&&!['CLAIMED','BORROWED','REJECTED','EXPIRED'].includes(r.status)){r.status='EXPIRED';r.proof=null;}
    };
    const bound=async wallet=>{const record=await registry.findByWallet(wallet);if(!record)fail('ONBOARDING_REQUIRED');
      const w=workers.get(record.identityNullifier);if(!w)fail('WORKER_NOT_FOUND');return w;};
    const owner=async(wallet,id)=>{const p=await session.client.getPassport(String(id));if(!same(p.holderWallet,wallet))fail('UNAUTHORIZED_WORKER');return p;};
    const assertWorker=wallet=>{if(Object.values(bundle.roles).some(a=>same(a,wallet)))fail('WORKER_ROLE_REQUIRED');};
    const assertRole=(wallet,role)=>{if(!same(wallet,bundle.roles[role]))fail('ROLE_REQUIRED');};
    const assertion=(w,wallet)=>idp.issueAssertion({workerIdentityNullifier:w.persona.identityNullifierHash,workerWalletAddress:wallet});
    const chainTime=async()=>Number((await local.provider.getBlock('latest')).timestamp);
    const getOnboard=(wallet,id)=>{const v=onboards.get(id);if(!v||!same(v.wallet,wallet))fail('ONBOARDING_SESSION_REJECTED');return v;};
    const getRequest=(wallet,id,workerOnly=false)=>{const r=requests.get(id);if(!r||r.expiresAt<=now())fail('REQUEST_EXPIRED');
      if(!same(r.holder,wallet)&&(workerOnly||!same(wallet,bundle.roles.verifier)))fail('UNAUTHORIZED_WORKER');return r;};
    const transaction=(contract,method,args)=>({to:contract.target,data:contract.interface.encodeFunctionData(method,args),value:'0x0'});
    const remember=(w,event,details={})=>{w.history=[{event,at:now(),...details},...w.history.filter(x=>x.at>now()-90*86400)].slice(0,20);};
    const summary=s=>({incomeLast6MonthsPaise:s.monthlyGigIncomeTotals.slice(-6).reduce((a,b)=>a+b,0),
      activeMonthsLast12:s.monthlyActivity.slice(-12).reduce((a,b)=>a+b,0),
      verifiedHistoryStartDay:s.verifiedHistoryStartDate,evidenceCutoff:s.evidenceUpdatedAt});
    async function dispatch(method,p={}){
      expiry();
      if(method==='info')return clean(bundle);
      if(method==='publicPassport')return session.client.getPassport(String(p.passportId));
      if(method==='challenge')return login.challenge(p.wallet);
      if(method==='login'){const result=login.login(p.nonce,p.signature,p.connectionMode);
        if(await registry.findByWallet(result.workerWallet))completeLogin(result.token);return result;}
      const wallet=login.authenticate(p.token);
      const key=sessionKey(p.token),record=await registry.findByWallet(wallet);
      const privileged=same(wallet,bundle.roles.admin)||same(wallet,bundle.roles.verifier);
      const fullyAuthenticated=privileged||!!record&&verifiedSessions.has(key);
      if(method==='logout'){verifiedSessions.delete(key);loginOtps.delete(key);login.logout(p.token);return {loggedOut:true};}
      if(method.startsWith('loginOtp')){
        if(!record||privileged||fullyAuthenticated)fail('PHONE_LOGIN_NOT_REQUIRED');
        if(method==='loginOtpStart'){
          const normalized=phone.normalizePhoneNumber(p.phone);
          if(phone.hashPhoneNumber(normalized)!==record.phoneHash)fail('REGISTERED_PHONE_REQUIRED');
          const v=await phone.startVerification({phoneNumber:normalized});
          loginOtps.set(key,{normalized,verificationId:v.verificationId,expiresAt:v.expiresAt});
          return {phoneMasked:v.maskedPhoneNumber,expiresAt:v.expiresAt,cooldownSeconds:v.cooldownSeconds};
        }
        const pending=loginOtps.get(key);if(!pending)fail('OTP_NOT_ACTIVE');
        if(method==='loginOtpMailbox')return {code:phone.getDevTestOtp(pending.verificationId),expiresAt:pending.expiresAt,disclosure:'LOCAL MOCK MAILBOX — no SMS or phone possession assurance'};
        if(method==='loginOtpVerify'){
          await phone.checkVerification({phoneNumber:pending.normalized,code:p.code});
          loginOtps.delete(key);completeLogin(p.token);return {authenticated:true};
        }
        fail('METHOD_UNSUPPORTED');
      }
      if(!fullyAuthenticated&&!['dashboard','onboardStart','onboardWallet','otpStart','otpMailbox','otpVerify','identityCommit'].includes(method))fail(record?'WORKER_AUTHENTICATION_INCOMPLETE':'ONBOARDING_REQUIRED');
      if(method==='dashboard'){
        if(!fullyAuthenticated){
          const entry=[...onboards.entries()].reverse().find(([,o])=>same(o.wallet,wallet));
          const s=entry?await entry[1].service.getSession(entry[0]):null;
          return clean({wallet,connectionMode:login.connectionMode(p.token),sessionExpiresAt:login.expiresAt(p.token),role:'pending',authentication:record?'PHONE_REQUIRED':'ONBOARDING_REQUIRED',phoneMasked:record?.phoneMasked,
            onboarding:s?{sessionId:s.sessionId,state:s.state,otp:entry[1].otp??null}:null,
            worker:null,summary:null,passport:null,consent:null,history:[],requests:[]});
        }
        const w=record&&workers.get(record.identityNullifier);
        const passport=w?.passportId?await owner(wallet,w.passportId):null;
        return clean({wallet,connectionMode:login.connectionMode(p.token),sessionExpiresAt:login.expiresAt(p.token),authentication:'COMPLETE',role:same(wallet,bundle.roles.admin)?'admin':same(wallet,bundle.roles.verifier)?'verifier':'worker',
          worker:w?{name:w.persona.name,persona:w.persona.id,trust:'SYNTHETIC_MOCK_IDP',phoneMasked:record.phoneMasked}:null,
          consent:w?.consentId?(()=>{const c=consents.getConsent(w.consentId);return {consentId:c.consentId,status:c.status,expiresAt:c.expiresAt,scope:c.scope};})():null,passport,summary:w?.summary??null,
          identityState:passport?await session.client.getIdentityState(w.passportId):null,
          balanceMockUSDC:await local.token.balanceOf(wallet).then(String),history:w?.history??[],
          reissueAllowed:record?await passportClient.isReissueAllowed(record.identityNullifier):false,
          requests:await Promise.all([...requests.entries()].filter(([,r])=>same(r.holder,wallet)||same(wallet,bundle.roles.verifier))
            .map(async([id,r])=>{let contextStatus=null;if(r.result){const current=await session.client.getPassport(r.request.passportId);
              contextStatus=current.status!=='ACTIVE'?'PASSPORT_REVOKED':current.evidenceVersion!==r.verifiedContext.evidenceVersion||current.evidenceCommitment!==r.verifiedContext.evidenceCommitment?'EVIDENCE_CHANGED':Number(r.request.policy.maxEvidenceAgeDays)>0&&now()-Number(current.evidenceUpdatedAt)>Number(r.request.policy.maxEvidenceAgeDays)*86400?'STALE_EVIDENCE':'CURRENT';}
              return {id,consumer:r.request.consumer,passportId:r.request.passportId,policy:r.request.policy,status:r.status,result:r.result??null,
                contextStatus,verifiedAt:r.verifiedAt??null,receipt:r.receipt??null,expiresAt:r.expiresAt};}))});
      }
      if(method==='onboardStart'){
        if(record)fail('IDENTITY_ALREADY_BOUND');
        assertWorker(wallet);if(onboards.size>=128)fail('AUTH_BUSY');
        const recovery=p.recoveryIdentity?recoveries.get(p.recoveryIdentity.toLowerCase()):null;
        if(p.recoveryIdentity&&(!recovery||!same(recovery.wallet,wallet)))fail('RECOVERY_NOT_AUTHORIZED');
        const service=recovery?recoveryOnboarding:onboarding;
        const s=await service.createSession({walletAddress:wallet});
        onboards.set(s.sessionId,{wallet,service,recoveryIdentity:p.recoveryIdentity?.toLowerCase(),expiresAt:now()+1800});
        return {sessionId:s.sessionId,message:formatOnboardingChallengeMessage(s.sessionId,s.challengeNonce,wallet)};
      }
      if(method==='onboardWallet'){
        const o=getOnboard(wallet,p.sessionId);await o.service.verifyWallet({sessionId:p.sessionId,walletAddress:wallet,signature:p.signature});return {state:'WALLET_VERIFIED'};
      }
      if(method==='otpStart'){
        const o=getOnboard(wallet,p.sessionId),v=await o.service.requestPhoneOtp({sessionId:p.sessionId,phoneNumber:p.phone});
        o.otp={expiresAt:now()+300,resendAt:now()+v.cooldownSeconds,phoneMasked:v.phoneMasked};return {...v,...o.otp};
      }
      if(method==='otpMailbox'){
        const o=getOnboard(wallet,p.sessionId),s=await o.service.getSession(p.sessionId);
        if(s.state!=='WALLET_VERIFIED'||!o.otp||o.otp.expiresAt<=now())fail('OTP_NOT_ACTIVE');
        return {code:phone.getDevTestOtp(s.phoneVerificationId),expiresAt:o.otp.expiresAt,disclosure:'LOCAL MOCK MAILBOX — no SMS or phone possession assurance'};
      }
      if(method==='otpVerify'){
        const o=getOnboard(wallet,p.sessionId);await o.service.verifyPhoneOtp({sessionId:p.sessionId,otpCode:p.code});return {state:'PHONE_VERIFIED'};
      }
      if(method==='identityCommit'){
        const o=getOnboard(wallet,p.sessionId),persona=PERSONAS[p.persona];if(!persona)fail('PERSONA_UNKNOWN');
        const identity=persona.identityNullifierHash.toLowerCase();
        if(o.recoveryIdentity&&o.recoveryIdentity!==identity)fail('RECOVERY_IDENTITY_MISMATCH');
        if(!o.recoveryIdentity&&await registry.findByIdentityNullifier(identity))fail('IDENTITY_ALREADY_BOUND');
        const serviceIdp=o.recoveryIdentity?recoveryIdp:idp;
        await o.service.verifyAadhaar({sessionId:p.sessionId,mode:'SYNTHETIC_MOCK_IDP',mockAssertionPayload:{
          assertion:serviceIdp.issueAssertion({workerIdentityNullifier:identity,workerWalletAddress:wallet})}});
        if(o.recoveryIdentity){
          const grant=recoveries.get(identity);if(!grant||!same(grant.wallet,wallet)||!await passportClient.isReissueAllowed(identity))fail('RECOVERY_NOT_AUTHORIZED');
          const verified=await o.service.getSession(p.sessionId);
          const phoneOwner=await registry.findByPhoneHash(verified.phoneHash);
          if(phoneOwner&&phoneOwner.identityNullifier!==identity)fail('PHONE_ALREADY_BOUND');
          await registry.rebindWallet(identity,wallet,'Admin-approved revoked passport recovery; replacement wallet + mock OTP + signed synthetic ID');
          idp.rebindWorkerWallet(identity,wallet);const w=workers.get(identity);w.passportId=null;w.consentId=null;w.summary=null;
          recoveries.delete(identity);remember(w,'RECOVERED_BINDING');
          await o.service.revokeSession(p.sessionId,'Recovery completed');
        }else{
          await o.service.commitBinding(p.sessionId);
          workers.set(identity,{persona,passportId:null,consentId:null,summary:null,history:[]});
        }
        completeLogin(p.token);onboards.delete(p.sessionId);return {verified:true,trust:'SYNTHETIC_MOCK_IDP'};
      }
      if(method==='actionChallenge'){
        const w=await bound(wallet);const allowed=['CREATE_CONSENT','MINT_PASSPORT','REFRESH_PASSPORT','REISSUE_PASSPORT','RECONSTRUCT_EVIDENCE','FETCH_FINANCIAL_DATA'];
        if(!allowed.includes(p.action))fail('ACTION_UNSUPPORTED');if(actions.size>=128)fail('AUTH_BUSY');
        const expectedPassportId=p.action==='CREATE_CONSENT'?0:['MINT_PASSPORT','REISSUE_PASSPORT'].includes(p.action)?await passportClient.getNextPassportId():Number(w.passportId);
        if(p.action!=='CREATE_CONSENT'&&!w.consentId)fail('CONSENT_REQUIRED');
        const value={action:p.action,workerWalletAddress:wallet.toLowerCase(),consentId:p.action==='CREATE_CONSENT'?'':w.consentId,
          expectedPassportId,timestamp:now(),chainId:1337,nonce:randomUUID()};
        const id=randomUUID(),cutoff=await chainTime();
        const scopeCutoff=p.action==='RECONSTRUCT_EVIDENCE'?Number((await owner(wallet,w.passportId)).evidenceUpdatedAt):
          p.action==='FETCH_FINANCIAL_DATA'?Math.min(cutoff,consents.getConsent(w.consentId).scope.toTimestamp):cutoff;
        actions.set(id,{wallet,value,cutoff,requestId:p.requestId,expiresAt:now()+300});
        return {id,value,message:auth.formatWorkerAuthMessage(value),scope:{source:'SIGNED_SYNTHETIC_MOCK_FIP',account:w.persona.accountId,cutoff:scopeCutoff}};
      }
      if(method==='actionSubmit'){
        const a=actions.get(p.id);if(!a||!same(a.wallet,wallet))fail('ACTION_EXPIRED');actions.delete(p.id);
        const w=await bound(wallet),walletAuthorization={...a.value,signature:p.signature};auth.verifyWorkerAuthorization(walletAuthorization);
        const identityAssertion=assertion(w,wallet);
        if(a.value.action==='FETCH_FINANCIAL_DATA'){
          replay.consume(walletAuthorization);
          const c=consents.getConsent(w.consentId),cutoff=Math.min(a.cutoff,c.scope.toTimestamp);
          const envelope=fip.fetchSignedDataByConsent(w.consentId,cutoff,now(),{identityAssertion,walletAuthorization});
          const verified=sourceVerifier.verifyEnvelope(envelope,w.persona.identityNullifierHash);
          const classified=new TransactionClassifier(CURRENT_DIRECTORY_VERSION).classifyAll(verified.payload.transactions);
          const rows=classified.slice().sort((a,b)=>b.raw.timestamp-a.raw.timestamp).slice(0,100).map(x=>({timestamp:x.raw.timestamp,amountMinor:x.raw.amountMinor,direction:x.raw.direction,
            rail:x.raw.rail,description:x.raw.narration,remitter:x.raw.remitter.name,category:x.category,platform:x.matchedPlatform??null,reason:x.classificationReason}));
          return {source:'SIGNED_SYNTHETIC_MOCK_FIP',authenticated:true,total:classified.length,counted:classified.filter(x=>x.isGigIncome).length,rows,cutoff};
        }
        if(a.value.action==='CREATE_CONSENT'){
          replay.consume(walletAuthorization);
          const c=consents.createConsent({accountId:w.persona.accountId,toTimestamp:a.cutoff,durationSeconds:1800,identityAssertion,walletAuthorization});
          w.consentId=c.consentId;remember(w,'CONSENT_GRANTED');return {consentId:c.consentId};
        }
        const input={consentId:w.consentId,workerWalletAddress:wallet,workerIdentityNullifier:w.persona.identityNullifierHash,
          expectedPassportId:a.value.expectedPassportId,sourceDirectoryVersion:CURRENT_DIRECTORY_VERSION,cutoffTimestamp:a.cutoff,identityAssertion,walletAuthorization};
        if(a.value.action==='RECONSTRUCT_EVIDENCE'){
          const r=getRequest(wallet,a.requestId,true);if(r.status!=='APPROVED')fail('WORKER_APPROVAL_REQUIRED');
          const current=await owner(wallet,w.passportId);
          const api=session.createClient({reconstruct:async()=>{
            const {snapshot}=attestation.reconstructEvidenceSnapshot({consentId:w.consentId,workerWalletAddress:wallet,
              workerIdentityNullifier:w.persona.identityNullifierHash,passportId:Number(w.passportId),
              evidenceUpdatedAt:Number(current.evidenceUpdatedAt),sourceDirectoryVersion:Number(current.sourceDirectoryVersion),identityAssertion,walletAuthorization});
            const computed=await commitment.computeCommitment(snapshot);snapshot.evidenceCommitment=computed.evidenceCommitment;
            return translateBackendAWitness(buildProverWitnessPayload(snapshot,computed.evidenceCommitment),
              {schemaVersion:current.schemaVersion,evidenceVersion:current.evidenceVersion},session.hashes);
          }});
          r.status='PROVING';
          try{r.proof=await api.generateProof({...r.request,evidenceHandle:'private-authorized-reconstruction'});
            r.result=await api.verify(r.request,r.proof);r.verifiedContext={evidenceVersion:current.evidenceVersion,evidenceCommitment:current.evidenceCommitment};r.verifiedAt=now();r.status='VERIFIED';remember(w,'PROOF_VERIFIED');return {status:r.status,result:r.result};
          }catch(e){r.status='REJECTED';r.proof=null;throw e;}
        }
        let result;
        if(a.cutoff>consents.getConsent(w.consentId).scope.toTimestamp)fail('RENEW_CONSENT_FOR_CURRENT_CUTOFF');
        if(a.value.action==='MINT_PASSPORT')result=await attestation.attestAndMintOnChain(input);
        else if(a.value.action==='REISSUE_PASSPORT')result=await attestation.reissuePassportOnChain(input);
        else{await owner(wallet,w.passportId);result=await attestation.refreshPassportEvidenceOnChain(input,Number(w.passportId));}
        w.passportId=String(result.passportId);w.summary=summary(result.attestation.snapshot);remember(w,a.value.action,{hash:passportClient.receipts.at(-1)?.hash});
        return {passport:await session.client.getPassport(w.passportId),summary:w.summary};
      }
      if(method==='revokeConsent'){
        const w=await bound(wallet);if(w.consentId)consents.revokeConsent(w.consentId);remember(w,'CONSENT_REVOKED');return {revoked:true};
      }
      if(method==='localGas'){
        assertWorker(wallet);const w=await bound(wallet);
        if(w.gasFundedAt&&now()-w.gasFundedAt<86400||await local.provider.getBalance(wallet)>=100000000000000000n)fail('LOCAL_GAS_ALREADY_FUNDED');
        // Local test ETH only, fixed amount and session-owned recipient. No caller-supplied transfer.
        const sent=await local.signers[0].sendTransaction({to:wallet,value:250000000000000000n});
        const receipt=await sent.wait();w.gasFundedAt=now();remember(w,'LOCAL_TEST_GAS',{hash:receipt.hash});
        return {hash:receipt.hash,blockNumber:receipt.blockNumber,status:receipt.status};
      }
      if(method==='applyService'){
        assertWorker(wallet);if(requests.size>=512)fail('REQUEST_BUSY');if(!['loan','welfare'].includes(p.consumer))fail('CONSUMER_UNSUPPORTED');
        const w=await bound(wallet);if(!w.passportId)fail('PASSPORT_REQUIRED');
        const passport=await owner(wallet,w.passportId);if(passport.status!=='ACTIVE')fail('PASSPORT_REVOKED');
        const state=await session.client.getIdentityState(w.passportId);
        if(p.consumer==='loan'&&state.principal!=='0')fail('ACTIVE_LOAN');
        if(p.consumer==='welfare'&&state.claimed)fail('BENEFIT_ALREADY_CLAIMED');
        if([...requests.values()].some(r=>same(r.holder,wallet)&&r.request.consumer===p.consumer&&r.expiresAt>now()&&(['PENDING_WORKER','APPROVED','PROVING'].includes(r.status)||r.status==='VERIFIED'&&r.verifiedContext?.evidenceVersion===passport.evidenceVersion&&r.verifiedContext?.evidenceCommitment===passport.evidenceCommitment&&!['income','history','activity'].some(k=>r.result?.enabled[k]&&r.result[k]==='FAIL'))))fail('APPLICATION_ALREADY_ACTIVE');
        // The authorized LOCAL service signs the existing consumer policy format.
        // Caller-supplied criteria, passport, signer and signature are never accepted.
        const policy={...consumerPolicies[p.consumer],requestId:'0x'+randomBytes(32).toString('hex'),verifierId:bundle.roles.verifier,expiresAt:String(now()+900)};
        validatePolicy(policy);const domain=domainFor(1337,bundle.contracts[p.consumer].address);
        const verifierSignature=await local.signing(bundle.roles.verifier).signTypedData(domain,policyTypes,policy);
        const id=policy.requestId;requests.set(id,{holder:wallet,expiresAt:Number(policy.expiresAt),status:'PENDING_WORKER',initiatedBy:'WORKER',request:{
          protocolVersion:bundle.protocolVersion,eligibilityProfile:bundle.eligibilityProfile,consumer:p.consumer,passportId:w.passportId,policy,verifierSignature}});
        remember(w,'SERVICE_APPLICATION',{consumer:p.consumer,requestId:id});return {id,status:'PENDING_WORKER'};
      }
      if(method==='policyPrepare'){
        assertRole(wallet,'verifier');if(requests.size>=512)fail('REQUEST_BUSY');if([...requests.values()].filter(r=>r.expiresAt>now()).length>=128)fail('REQUEST_BUSY');
        if(!['gate','welfare','loan'].includes(p.consumer))fail('CONSUMER_UNSUPPORTED');
        const passport=await session.client.getPassport(p.passportId);if(passport.status!=='ACTIVE')fail('PASSPORT_REVOKED');
        const base=consumerPolicies[p.consumer]??{incomeEnabled:'0',incomeWindowMonths:'0',minAverageIncomePaise:'0',activityEnabled:'0',
          activityIsWeekly:'0',activityWindow:'0',minActivePeriods:'0',historyEnabled:'0',minHistoryMonths:'0',maxEvidenceAgeDays:'30'};
        const ttl=p.expiresInSeconds===undefined?900:Number(p.expiresInSeconds);if(!Number.isInteger(ttl)||ttl<60||ttl>3600)fail('INVALID_REQUEST_EXPIRY');
        const policy={...base,...(p.consumer==='gate'?p.criteria:{}),requestId:'0x'+randomBytes(32).toString('hex'),verifierId:wallet,expiresAt:String(now()+ttl)};
        validatePolicy(policy);const domain=domainFor(1337,bundle.contracts[p.consumer].address),id=policy.requestId;
        requests.set(id,{holder:passport.holderWallet,expiresAt:now()+ttl,status:'AWAITING_VERIFIER',request:{protocolVersion:bundle.protocolVersion,
          eligibilityProfile:bundle.eligibilityProfile,consumer:p.consumer,passportId:String(p.passportId),policy}});
        return clean({id,domain,types:policyTypes,value:policy});
      }
      if(method==='policySubmit'){
        assertRole(wallet,'verifier');const r=getRequest(wallet,p.id);if(r.status!=='AWAITING_VERIFIER')fail('REQUEST_REPLAY');
        const domain=domainFor(1337,bundle.contracts[r.request.consumer].address);
        if(!same(verifyTypedData(domain,policyTypes,r.request.policy,p.signature),wallet))fail('VERIFIER_SIGNATURE_INVALID');
        r.request.verifierSignature=p.signature;r.status='PENDING_WORKER';return {id:p.id,status:r.status};
      }
      if(method==='approval'){
        const r=getRequest(wallet,p.id,true);if(r.status!=='PENDING_WORKER')fail('REQUEST_NOT_PENDING');
        return session.client.getApproval(r.request);
      }
      if(method==='approve'){
        const r=getRequest(wallet,p.id,true);if(r.status!=='PENDING_WORKER')fail('REQUEST_REPLAY');
        const a=await session.client.getApproval(r.request);
        if(!same(verifyTypedData(a.domain,a.types,a.value,p.signature),wallet))fail('WORKER_APPROVAL_INVALID');
        r.request.workerSignature=p.signature;r.status='APPROVED';return {status:r.status};
      }
      if(method==='reject'){
        const r=getRequest(wallet,p.id,true);r.status='REJECTED';r.proof=null;return {status:r.status};
      }
      if(method==='consumerTransaction'){
        const r=getRequest(wallet,p.id,true);if(r.status!=='VERIFIED'||!r.proof)fail('PROOF_REQUIRED');
        const result=await session.client.verify(r.request,r.proof);if(['income','history','activity'].some(k=>result[k]!=='PASS'))fail('CONDITION_FAILED');
        const kind=r.request.consumer==='welfare'?'claim':r.request.consumer==='loan'?'borrow':null;if(!kind)fail('CONSUMER_UNSUPPORTED');
        const x={passportId:r.request.passportId,policy:r.request.policy,verifierSignature:r.request.verifierSignature,
          workerSignature:r.request.workerSignature,...r.proof.solidity};delete x.publicSignals;
        const contract=local.consumers[r.request.consumer].connect(local.provider);await contract[kind].staticCall(x,{from:wallet});
        return transaction(contract,kind,[x]);
      }
      if(method==='transactionMined'){
        const receipt=await local.provider.getTransactionReceipt(p.hash);if(!receipt||receipt.status!==1)fail('TRANSACTION_NOT_SUCCESSFUL');
        const tx=await local.provider.getTransaction(p.hash);if(!same(tx.from,wallet))fail('UNAUTHORIZED_WORKER');
        if(p.id){const r=getRequest(wallet,p.id,true);const kind=r.request.consumer==='welfare'?'claim':'borrow';
          const decoded=local.consumers[r.request.consumer].interface.parseTransaction({data:tx.data,value:tx.value});
          if(r.status!=='VERIFIED'||!same(tx.to,local.consumers[r.request.consumer].target)||decoded?.name!==kind||decoded.args[0].policy.requestId!==r.request.policy.requestId||String(decoded.args[0].passportId)!==r.request.passportId||!await local.consumers[r.request.consumer].consumedRequests(r.request.policy.requestId))fail('TRANSACTION_MISMATCH');
          r.status=kind==='claim'?'CLAIMED':'BORROWED';r.receipt={hash:receipt.hash,blockNumber:receipt.blockNumber,status:receipt.status};r.proof=null;}
        const record=await registry.findByWallet(wallet);if(record)remember(workers.get(record.identityNullifier),'TRANSACTION_CONFIRMED',{hash:receipt.hash});
        return {hash:receipt.hash,status:receipt.status};
      }
      if(method==='repaymentTransaction'){
        const w=await bound(wallet);await owner(wallet,w.passportId);
        if((await session.client.getIdentityState(w.passportId)).principal!=='100000000')fail('NO_ACTIVE_LOAN');
        if(p.approve)return transaction(local.token,'approve',[local.consumers.loan.target,100000000n]);
        await local.consumers.loan.connect(local.provider).repay.staticCall(w.passportId,{from:wallet});
        return transaction(local.consumers.loan,'repay',[w.passportId]);
      }
      if(method==='adminTransaction'){
        assertRole(wallet,'admin');const passport=await session.client.getPassport(p.passportId);
        if(p.authorize){if(passport.status!=='REVOKED')fail('REVOKE_FIRST');return transaction(local.passport,'authorizeReissue',[passport.identityNullifierHash]);}
        return transaction(local.passport,'revoke',[p.passportId,'ADMIN_LOCAL_RECOVERY']);
      }
      if(method==='recoveryAuthorize'){
        assertRole(wallet,'admin');const passport=await session.client.getPassport(p.passportId),replacement=getAddress(p.wallet);
        assertWorker(replacement);if(passport.status!=='REVOKED'||!await passportClient.isReissueAllowed(passport.identityNullifierHash))fail('RECOVERY_NOT_AUTHORIZED');
        if(await registry.findByWallet(replacement))fail('WALLET_ALREADY_BOUND');
        recoveries.set(passport.identityNullifierHash.toLowerCase(),{wallet:replacement,expiresAt:now()+1800});return {identity:passport.identityNullifierHash};
      }
      fail('METHOD_UNSUPPORTED');
    }
    let queue=Promise.resolve(),closed=false;
    const serializedDispatch=(method,p)=>{const job=queue.then(async()=>{if(closed)fail('SESSION_CLOSED');try{return await dispatch(method,p);}finally{persist();}});queue=job.catch(()=>{});return job;};
    return {bundle,session,dispatch:serializedDispatch,async close(){closed=true;await queue;try{persist();login.close();await session.close();}finally{profile?.close();}}};
  }catch(e){try{await session?.close();}finally{profile?.close();}throw e;}
}
