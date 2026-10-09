import type {AbstractProvider,Signer,InterfaceAbi,TypedDataDomain,TypedDataField} from 'ethers';
import type {ProofRequest,ProofResult} from '../../circuits/service/trusted-prover.mjs';
export interface IntegrationBundle {
  bundleVersion: 'gv-local-integration-b5/1'; protocolVersion: 'gv-local-prover-b4/1';
  eligibilityProfile: 'gv-eligibility-0.2-provisional'; commitmentProfile: 'gv-poseidon-hash-only-0.2.0';
  evidenceSchemaVersion: '2';
  localOnly: true; syntheticOnly: true; chainId: 1337; rpcUrl: string; setupId: string; publicSignalOrder: string[];
  contracts: Record<'passport'|'math'|'gate'|'welfare'|'loan'|'token',{address:string;abi:InterfaceAbi;contract:string}>;
  fixture: {passportId:string;holder:string;identity:string;source:string;evidenceHandle:string};
}
export interface PassportView {passportId:string;status:'ACTIVE'|'REVOKED';holderWallet:string;
  identityNullifierHash:string;evidenceCommitment:string;evidenceVersion:string;evidenceUpdatedAt:string;
  issuedAt:string;schemaVersion:string;evidenceProvider:string;supersedes:string;sourceDirectoryVersion:string;}
export interface TransactionView {hash:string;blockNumber:number;status:number;gasUsed:string;}
export interface ConditionView {income:'PASS'|'FAIL';history:'PASS'|'FAIL';activity:'PASS'|'FAIL';
  enabled:{income:boolean;history:boolean;activity:boolean};}
export interface BackendClient {
  readonly bundle:IntegrationBundle;
  getPassport(id:string):Promise<PassportView>;
  getNextPassportId():Promise<string>;
  getActivePassportByIdentity(identity:string):Promise<string>;
  isReissueAllowed(identity:string):Promise<boolean>;
  getIdentityState(id:string):Promise<{identity:string;claimed:boolean;principal:string}>;
  getApproval(request:Omit<ProofRequest,'workerSignature'>):Promise<{domain:TypedDataDomain;types:Record<string,TypedDataField[]>;value:Record<string,string>}>;
  approveRequest(request:Omit<ProofRequest,'workerSignature'>,signer:Signer):Promise<ProofRequest>;
  generateProof(request:ProofRequest):Promise<ProofResult>;
  verify(request:ProofRequest,proof:ProofResult):Promise<ConditionView>;
  claim(request:ProofRequest,proof:ProofResult,signer:Signer):Promise<TransactionView>;
  borrow(request:ProofRequest,proof:ProofResult,signer:Signer):Promise<TransactionView>;
  approveRepayment(signer:Signer):Promise<TransactionView>;
  repay(id:string,signer:Signer):Promise<TransactionView>;
}
export declare const bundleVersion:'gv-local-integration-b5/1';
export declare function createBackendClient(config:{bundle:IntegrationBundle;provider:AbstractProvider;
  prover?:{prove(request:ProofRequest):Promise<ProofResult>};isClosed?:()=>boolean}):BackendClient;
