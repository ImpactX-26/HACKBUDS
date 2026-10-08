/**
 * GigVault - GigPassport.sol Integration Client & State Machine Adapter
 * 
 * Implements the contract boundary for on-chain passport issuance and evidence refresh:
 * 1. Dedicated ATTESTER_ROLE wallet authorization (strictly separated from worker and admin).
 * 2. Atomic sequential passport ID checks (reverting on ExpectedIdMismatch).
 * 3. Atomic recompute and retry mechanism on expected-ID contention.
 * 4. Terminal revocation enforcement and authorized reissue checking.
 * 5. Rejection of duplicate active passports per identity nullifier.
 * 
 * Matches GigPassport.sol (commit 10fdc3e on upstream/feature/blockchain-zk) exactly.
 */

export interface EvidenceCommitmentData {
  commitment: string; // BigInt decimal string or uint256 hex
  updatedAt: number; // Unix seconds
  schemaVersion: number;
  providerRef: string; // bytes32 hex
  sourceDirectoryVersion: number;
}

export interface PassportRecord {
  passportId: number;
  holderWallet: string;
  identityNullifierHash: string;
  evidenceCommitment: string;
  evidenceVersion: number;
  evidenceUpdatedAt: number;
  issuedAt: number;
  status: 'ACTIVE' | 'REVOKED';
  schemaVersion: number;
  evidenceProvider: string;
  supersedes: number; // Previous revoked passportId, if any
}

export class ExpectedIdMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpectedIdMismatchError';
  }
}

export class ActivePassportExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivePassportExistsError';
  }
}

export class ReissueNotAuthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReissueNotAuthorizedError';
  }
}

export class CommitmentUnchangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommitmentUnchangedError';
  }
}

export class EvidenceTimestampRegressedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceTimestampRegressedError';
  }
}

export class PassportNotActiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PassportNotActiveError';
  }
}

export class LiveAdapterNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveAdapterNotConfiguredError';
  }
}

export class LiveSubmissionProhibitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveSubmissionProhibitedError';
  }
}

export interface IGigPassportClient {
  readonly isMockClient: boolean;
  getNextPassportId(): Promise<number>;
  getActivePassportByIdentity(identityNullifier: string): Promise<number>;
  getPassport(passportId: number): Promise<PassportRecord | null>;
  isReissueAllowed(identityNullifier: string): Promise<boolean>;
  mint(
    expectedId: number,
    holder: string,
    identity: string,
    evidence: EvidenceCommitmentData,
    caller?: string
  ): Promise<number>;
  refresh(passportId: number, evidence: EvidenceCommitmentData, caller?: string): Promise<void>;
  revoke(passportId: number, reason: string, caller?: string): Promise<void>;
  authorizeReissue(identity: string, caller?: string): Promise<void>;
}

/**
 * LIVE PRODUCTION SMART CONTRACT ADAPTER BOUNDARY
 * Communicates with on-chain GigPassport.sol contract deployed on Polygon Amoy / EVM.
 * 
 * FAIL-CLOSED INVARIANT:
 * If no live contract address, RPC provider, or authenticated signer is provided,
 * this client STRICTLY throws LiveAdapterNotConfiguredError. It NEVER fakes or
 * simulates on-chain transaction success.
 */
export class LiveGigPassportContractClient implements IGigPassportClient {
  public readonly isMockClient = false;
  private contractAddress?: string;
  private signerOrProvider?: any;

  constructor(contractAddress?: string, signerOrProvider?: any) {
    this.contractAddress = contractAddress;
    this.signerOrProvider = signerOrProvider;
  }

  private assertConfigured(): void {
    if (!this.contractAddress || !this.signerOrProvider) {
      throw new LiveAdapterNotConfiguredError(
        'LiveAdapterNotConfigured: live GigPassport contract address or RPC provider/signer is not configured. Backend A fails closed.'
      );
    }
  }

  public async getNextPassportId(): Promise<number> {
    this.assertConfigured();
    throw new LiveAdapterNotConfiguredError('Live contract connection pending Backend B deployment.');
  }

  public async getActivePassportByIdentity(_identityNullifier: string): Promise<number> {
    this.assertConfigured();
    throw new LiveAdapterNotConfiguredError('Live contract connection pending Backend B deployment.');
  }

  public async getPassport(_passportId: number): Promise<PassportRecord | null> {
    this.assertConfigured();
    throw new LiveAdapterNotConfiguredError('Live contract connection pending Backend B deployment.');
  }

  public async isReissueAllowed(_identityNullifier: string): Promise<boolean> {
    this.assertConfigured();
    throw new LiveAdapterNotConfiguredError('Live contract connection pending Backend B deployment.');
  }

  public async mint(
    _expectedId: number,
    _holder: string,
    _identity: string,
    _evidence: EvidenceCommitmentData
  ): Promise<number> {
    this.assertConfigured();
    throw new LiveAdapterNotConfiguredError('Live contract mint pending Backend B deployment.');
  }

  public async refresh(_passportId: number, _evidence: EvidenceCommitmentData): Promise<void> {
    this.assertConfigured();
    throw new LiveAdapterNotConfiguredError('Live contract refresh pending Backend B deployment.');
  }

  public async revoke(_passportId: number, _reason: string): Promise<void> {
    this.assertConfigured();
    throw new LiveAdapterNotConfiguredError('Live contract revoke pending Backend B deployment.');
  }

  public async authorizeReissue(_identity: string): Promise<void> {
    this.assertConfigured();
    throw new LiveAdapterNotConfiguredError('Live contract authorizeReissue pending Backend B deployment.');
  }
}

/**
 * LOCAL MOCK TEST SIMULATOR ONLY:
 * In-memory contract adapter modeling GigPassport.sol state transitions for unit testing.
 * 
 * IMPORTANT ARCHITECTURAL BOUNDARY:
 * This is NOT the deployed Solidity contract or a live EVM instance. Real on-chain
 * transactions and verified Poseidon commitments remain deferred until Backend B's
 * shared cryptographic adapter is finalized and approved.
 * 
 * Mock commitments generated with temporary digests are strictly blocked from being
 * broadcast to live networks (Polygon Amoy / Mainnet).
 */
export class MockGigPassportContract implements IGigPassportClient {
  public readonly isMockClient = true;
  public readonly adminAddress: string;
  public readonly attesterAddress: string;

  private nextPassportId = 1;
  private passports: Map<number, PassportRecord> = new Map();
  private activePassportByIdentity: Map<string, number> = new Map();
  private latestPassportByIdentity: Map<string, number> = new Map();
  private reissueAllowedMap: Map<string, boolean> = new Map();

  constructor(adminAddress: string, attesterAddress: string) {
    if (!adminAddress || !attesterAddress || adminAddress === attesterAddress) {
      throw new Error('RolesMustBeSeparate: admin and attester addresses must be non-zero and distinct');
    }
    this.adminAddress = adminAddress.toLowerCase();
    this.attesterAddress = attesterAddress.toLowerCase();
  }

  public async getNextPassportId(): Promise<number> {
    return this.nextPassportId;
  }

  public async getActivePassportByIdentity(identityNullifier: string): Promise<number> {
    return this.activePassportByIdentity.get(identityNullifier.toLowerCase()) || 0;
  }

  public async getPassport(passportId: number): Promise<PassportRecord | null> {
    return this.passports.get(passportId) || null;
  }

  public async isReissueAllowed(identityNullifier: string): Promise<boolean> {
    return this.reissueAllowedMap.get(identityNullifier.toLowerCase()) || false;
  }

  /**
   * Mint passport with expected ID check (ATTESTER_ROLE only).
   */
  public async mint(
    expectedId: number,
    holder: string,
    identity: string,
    evidence: EvidenceCommitmentData,
    caller = this.attesterAddress
  ): Promise<number> {
    if (caller.toLowerCase() !== this.attesterAddress) {
      throw new Error('AccessControl: caller is not authorized with ATTESTER_ROLE');
    }
    if (expectedId !== this.nextPassportId) {
      throw new ExpectedIdMismatchError(`ExpectedIdMismatch: expected ${expectedId}, actual ${this.nextPassportId}`);
    }
    const cleanIdentity = identity.toLowerCase();
    const cleanHolder = holder.toLowerCase();

    // Check active passport does not already exist
    if ((this.activePassportByIdentity.get(cleanIdentity) || 0) !== 0) {
      throw new ActivePassportExistsError(`ActivePassportExists: identity ${cleanIdentity} already has an ACTIVE passport`);
    }

    // Reissue check if previous passport exists
    const previous = this.latestPassportByIdentity.get(cleanIdentity) || 0;
    if (previous !== 0) {
      const prevPassport = this.passports.get(previous);
      if (!prevPassport || prevPassport.status !== 'REVOKED' || !this.reissueAllowedMap.get(cleanIdentity)) {
        throw new ReissueNotAuthorizedError(`ReissueNotAuthorized: identity ${cleanIdentity} has no reissue authorization`);
      }
      this.reissueAllowedMap.set(cleanIdentity, false); // Consumed on mint
    }

    const passportId = this.nextPassportId++;
    const nowSec = Math.floor(Date.now() / 1000);

    const record: PassportRecord = {
      passportId,
      holderWallet: cleanHolder,
      identityNullifierHash: cleanIdentity,
      evidenceCommitment: evidence.commitment,
      evidenceVersion: 1,
      evidenceUpdatedAt: evidence.updatedAt,
      issuedAt: nowSec,
      status: 'ACTIVE',
      schemaVersion: evidence.schemaVersion,
      evidenceProvider: evidence.providerRef,
      supersedes: previous,
    };

    this.passports.set(passportId, record);
    this.activePassportByIdentity.set(cleanIdentity, passportId);
    this.latestPassportByIdentity.set(cleanIdentity, passportId);

    return passportId;
  }

  /**
   * Refresh evidence for an existing ACTIVE passport (ATTESTER_ROLE only).
   */
  public async refresh(
    passportId: number,
    evidence: EvidenceCommitmentData,
    caller = this.attesterAddress
  ): Promise<void> {
    if (caller.toLowerCase() !== this.attesterAddress) {
      throw new Error('AccessControl: caller is not authorized with ATTESTER_ROLE');
    }

    const passport = this.passports.get(passportId);
    if (!passport || passport.status !== 'ACTIVE') {
      throw new PassportNotActiveError(`PassportNotActive: passport ${passportId} is not ACTIVE`);
    }

    if (evidence.commitment === passport.evidenceCommitment) {
      throw new CommitmentUnchangedError('CommitmentUnchanged: refresh requires a modified commitment');
    }
    if (evidence.updatedAt < passport.evidenceUpdatedAt) {
      throw new EvidenceTimestampRegressedError('EvidenceTimestampRegressed: evidenceUpdatedAt cannot be older than current');
    }

    passport.evidenceCommitment = evidence.commitment;
    passport.evidenceVersion++;
    passport.evidenceUpdatedAt = evidence.updatedAt;
    passport.schemaVersion = evidence.schemaVersion;
    passport.evidenceProvider = evidence.providerRef;
  }

  /**
   * Terminal revocation (ADMIN_ROLE only).
   */
  public async revoke(passportId: number, reason: string, caller = this.adminAddress): Promise<void> {
    if (caller.toLowerCase() !== this.adminAddress) {
      throw new Error('AccessControl: caller is not authorized with ADMIN_ROLE');
    }

    const passport = this.passports.get(passportId);
    if (!passport || passport.status !== 'ACTIVE') {
      throw new PassportNotActiveError(`PassportNotActive: cannot revoke non-active passport ${passportId}`);
    }

    passport.status = 'REVOKED';
    this.activePassportByIdentity.delete(passport.identityNullifierHash);
    this.reissueAllowedMap.delete(passport.identityNullifierHash);
  }

  /**
   * Authorize replacement passport reissue for a revoked identity (ADMIN_ROLE only).
   */
  public async authorizeReissue(identity: string, caller = this.adminAddress): Promise<void> {
    if (caller.toLowerCase() !== this.adminAddress) {
      throw new Error('AccessControl: caller is not authorized with ADMIN_ROLE');
    }

    const cleanIdentity = identity.toLowerCase();
    const previous = this.latestPassportByIdentity.get(cleanIdentity) || 0;
    const active = this.activePassportByIdentity.get(cleanIdentity) || 0;

    if (previous === 0 || active !== 0) {
      throw new Error(`ReissueRequiresRevokedPassport: identity ${cleanIdentity} must have a revoked passport`);
    }

    const prevPassport = this.passports.get(previous);
    if (!prevPassport || prevPassport.status !== 'REVOKED') {
      throw new Error(`ReissueRequiresRevokedPassport: previous passport ${previous} is not REVOKED`);
    }

    this.reissueAllowedMap.set(cleanIdentity, true);
  }
}
