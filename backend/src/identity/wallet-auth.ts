/**
 * GigVault - Worker Wallet Authorization & Signature Verification
 * 
 * Verifies that the connected EVM holder wallet explicitly authorized
 * the passport issuance or refresh request using personal_sign.
 * 
 * Invariants:
 * 1. Attestation requests MUST be signed by the claimed workerWalletAddress.
 * 2. Enforces timestamp freshness to prevent signature replay attacks.
 * 3. Binds the authorization directly to the specific consentId and expectedPassportId.
 */

import { ethers } from 'ethers';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { WorkerActionType, WorkerWalletAuthorization } from './types.js';

export function formatWorkerAuthMessage(auth: {
  application?: string;
  action: WorkerActionType;
  workerWalletAddress: string;
  consentId: string;
  expectedPassportId: number;
  timestamp: number;
  chainId?: number;
  nonce?: string;
}): string {
  const lines = [
    'GigVault Worker Action Authorization',
    `Application: ${auth.application ?? 'GigVault Protocol v1'}`,
    `Action: ${auth.action}`,
    `Wallet: ${auth.workerWalletAddress.toLowerCase().trim()}`,
    `Consent: ${auth.consentId.trim()}`,
    `Expected Passport ID: ${auth.expectedPassportId}`,
    `Timestamp: ${auth.timestamp}`,
  ];
  if (auth.chainId !== undefined) {
    lines.push(`Chain ID: ${auth.chainId}`);
  }
  if (auth.nonce !== undefined) {
    lines.push(`Nonce: ${auth.nonce}`);
  }
  return lines.join('\n');
}

export interface ConsumedAuthRecord {
  signature: string;
  nonce?: string;
  walletAddress: string;
  action: WorkerActionType;
  timestamp: number;
  consumedAt: number;
  // Minimal request digest for idempotency check (NEVER financial evidence!)
  requestId?: string;
  requestFingerprint?: string;
}

export interface ConsumeOptions {
  requestId?: string;
  requestFingerprint?: string;
  allowIdempotentReplay?: boolean;
  nowSec?: number;
}

export interface ConsumeResult {
  isConsumed: boolean;
  isIdempotentReplay: boolean;
}

/**
 * Pluggable Replay Store Interface.
 * Can be backed by in-memory Map, Redis, or persistent database WAL across restarts/replicas.
 * Invariant: Never stores raw financial records or plaintext evidence snapshots.
 */
export interface IReplayStore {
  consume(auth: WorkerWalletAuthorization, options?: ConsumeOptions): ConsumeResult;
  isConsumed(auth: WorkerWalletAuthorization): boolean;
  pruneExpired(maxAgeSeconds?: number, nowSec?: number): number;
  reset(): void;
}

export class FileReplayStoreCorruptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileReplayStoreCorruptedError';
  }
}

export class MemoryReplayStore implements IReplayStore {
  private recordsBySignature = new Map<string, ConsumedAuthRecord>();
  private recordsByNonce = new Map<string, ConsumedAuthRecord>();

  public pruneExpired(maxAgeSeconds = 300, nowSec = Math.floor(Date.now() / 1000)): number {
    let pruned = 0;
    for (const [sig, record] of this.recordsBySignature.entries()) {
      // Retain record until the authorization can no longer pass freshness verification
      const expiryTime = Math.max(record.timestamp, record.consumedAt) + maxAgeSeconds;
      if (nowSec > expiryTime) {
        this.recordsBySignature.delete(sig);
        if (record.nonce) {
          this.recordsByNonce.delete(`${record.walletAddress.toLowerCase()}:${record.nonce}`);
        }
        pruned++;
      }
    }
    return pruned;
  }

  public consume(auth: WorkerWalletAuthorization, options?: ConsumeOptions): ConsumeResult {
    const nowSec = options?.nowSec ?? Math.floor(Date.now() / 1000);
    this.pruneExpired(300, nowSec);

    const sigKey = auth.signature.toLowerCase();
    const existing = this.recordsBySignature.get(sigKey);

    if (existing) {
      if (
        options?.allowIdempotentReplay &&
        options?.requestFingerprint &&
        existing.requestFingerprint === options.requestFingerprint
      ) {
        return { isConsumed: true, isIdempotentReplay: true };
      }
      throw new Error('ReplayAttackDetected: worker authorization signature already consumed');
    }

    if (auth.nonce) {
      const nonceKey = `${auth.workerWalletAddress.toLowerCase()}:${auth.nonce}`;
      if (this.recordsByNonce.has(nonceKey)) {
        throw new Error(
          `ReplayAttackDetected: nonce ${auth.nonce} already consumed for wallet ${auth.workerWalletAddress}`
        );
      }
    }

    const record: ConsumedAuthRecord = {
      signature: sigKey,
      nonce: auth.nonce,
      walletAddress: auth.workerWalletAddress.toLowerCase(),
      action: auth.action,
      timestamp: auth.timestamp,
      consumedAt: nowSec,
      requestId: options?.requestId,
      requestFingerprint: options?.requestFingerprint,
    };

    this.recordsBySignature.set(sigKey, record);
    if (auth.nonce) {
      this.recordsByNonce.set(`${auth.workerWalletAddress.toLowerCase()}:${auth.nonce}`, record);
    }

    return { isConsumed: false, isIdempotentReplay: false };
  }

  public isConsumed(auth: WorkerWalletAuthorization): boolean {
    const sigKey = auth.signature.toLowerCase();
    if (this.recordsBySignature.has(sigKey)) return true;
    if (auth.nonce && this.recordsByNonce.has(`${auth.workerWalletAddress.toLowerCase()}:${auth.nonce}`)) return true;
    return false;
  }

  public reset(): void {
    this.recordsBySignature.clear();
    this.recordsByNonce.clear();
  }
}

/**
 * Zero-cost filesystem-backed replay store with cross-process exclusive locking.
 * Persists authorization records across actual process restarts and separate OS processes
 * on the same host using transactional lockfile and atomic file writes.
 * 
 * Guarantees:
 * 1. Mutual exclusion: exactly one of concurrent contending processes can consume a signature or nonce.
 * 2. Fail closed: throws FileReplayStoreCorruptedError on corrupted, malformed, or unreadable storage.
 * 3. Freshness alignment: retains records until the authorization can no longer pass freshness checks.
 * 4. Zero financial evidence: never stores raw financial records, account balances, or evidence snapshots.
 */
export class FileReplayStore implements IReplayStore {
  private filePath: string;
  private recordsBySignature = new Map<string, ConsumedAuthRecord>();
  private recordsByNonce = new Map<string, ConsumedAuthRecord>();
  private lockDepth = 0;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.withLock(() => {
      this.syncFromDisk();
    });
  }

  public getFilePath(): string {
    return this.filePath;
  }

  private acquireLock(timeoutMs = 5000, pollIntervalMs = 5): void {
    const lockPath = `${this.filePath}.lock`;
    const dir = path.dirname(lockPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR);
        try {
          fs.writeSync(fd, `${process.pid}:${Date.now()}`);
        } finally {
          fs.closeSync(fd);
        }
        return;
      } catch (err: any) {
        if (err.code === 'EEXIST') {
          // Check for stale lock (> 10 seconds old)
          try {
            const stats = fs.statSync(lockPath);
            if (Date.now() - stats.mtimeMs > 10000) {
              try {
                fs.unlinkSync(lockPath);
              } catch {
                // ignore
              }
              continue;
            }
          } catch {
            // lock may have been released in between
            continue;
          }
          // Sleep briefly before retrying
          try {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pollIntervalMs);
          } catch {
            const spinEnd = Date.now() + pollIntervalMs;
            while (Date.now() < spinEnd) {}
          }
        } else {
          throw err;
        }
      }
    }
    throw new Error(`FileReplayStoreLockTimeout: failed to acquire exclusive lock on ${lockPath} after ${timeoutMs}ms`);
  }

  private releaseLock(): void {
    const lockPath = `${this.filePath}.lock`;
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch {
      // Ignore if already deleted
    }
  }

  private withLock<T>(fn: () => T): T {
    if (this.lockDepth > 0) {
      this.lockDepth++;
      try {
        return fn();
      } finally {
        this.lockDepth--;
      }
    }

    this.acquireLock();
    this.lockDepth = 1;
    try {
      return fn();
    } finally {
      this.lockDepth = 0;
      this.releaseLock();
    }
  }

  private syncFromDisk(): void {
    if (!fs.existsSync(this.filePath)) {
      this.recordsBySignature.clear();
      this.recordsByNonce.clear();
      return;
    }

    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (readErr: any) {
      throw new FileReplayStoreCorruptedError(
        `Failed to read replay storage file at ${this.filePath}: ${readErr.message}`
      );
    }

    if (!raw.trim()) {
      throw new FileReplayStoreCorruptedError(
        `Replay storage file at ${this.filePath} is empty or whitespace-only`
      );
    }

    let records: unknown;
    try {
      records = JSON.parse(raw);
    } catch (parseErr: any) {
      throw new FileReplayStoreCorruptedError(
        `Replay storage file at ${this.filePath} contains malformed JSON: ${parseErr.message}`
      );
    }

    if (!Array.isArray(records)) {
      throw new FileReplayStoreCorruptedError(
        `Replay storage file at ${this.filePath} root must be a JSON array`
      );
    }

    this.recordsBySignature.clear();
    this.recordsByNonce.clear();

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (!rec || typeof rec !== 'object') {
        throw new FileReplayStoreCorruptedError(
          `Invalid record at index ${i} in ${this.filePath}: expected object`
        );
      }
      const record = rec as Partial<ConsumedAuthRecord>;
      if (typeof record.signature !== 'string' || !record.signature.trim()) {
        throw new FileReplayStoreCorruptedError(
          `Invalid record at index ${i} in ${this.filePath}: missing signature`
        );
      }
      if (typeof record.walletAddress !== 'string' || !record.walletAddress.trim()) {
        throw new FileReplayStoreCorruptedError(
          `Invalid record at index ${i} in ${this.filePath}: missing walletAddress`
        );
      }
      if (typeof record.action !== 'string' || !record.action.trim()) {
        throw new FileReplayStoreCorruptedError(
          `Invalid record at index ${i} in ${this.filePath}: missing action`
        );
      }
      if (typeof record.timestamp !== 'number' || !Number.isSafeInteger(record.timestamp) || record.timestamp <= 0) {
        throw new FileReplayStoreCorruptedError(
          `Invalid record at index ${i} in ${this.filePath}: invalid timestamp`
        );
      }
      if (typeof record.consumedAt !== 'number' || !Number.isSafeInteger(record.consumedAt) || record.consumedAt <= 0) {
        throw new FileReplayStoreCorruptedError(
          `Invalid record at index ${i} in ${this.filePath}: invalid consumedAt`
        );
      }
      if (record.nonce !== undefined && (typeof record.nonce !== 'string' || !record.nonce.trim())) {
        throw new FileReplayStoreCorruptedError(
          `Invalid record at index ${i} in ${this.filePath}: invalid nonce`
        );
      }
      if (record.requestId !== undefined && typeof record.requestId !== 'string') {
        throw new FileReplayStoreCorruptedError(
          `Invalid record at index ${i} in ${this.filePath}: invalid requestId`
        );
      }
      if (record.requestFingerprint !== undefined && typeof record.requestFingerprint !== 'string') {
        throw new FileReplayStoreCorruptedError(
          `Invalid record at index ${i} in ${this.filePath}: invalid requestFingerprint`
        );
      }

      const validRecord = record as ConsumedAuthRecord;
      this.recordsBySignature.set(validRecord.signature.toLowerCase(), validRecord);
      if (validRecord.nonce) {
        this.recordsByNonce.set(`${validRecord.walletAddress.toLowerCase()}:${validRecord.nonce}`, validRecord);
      }
    }
  }

  private persistToDisk(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const allRecords = Array.from(this.recordsBySignature.values());
      const tmpPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
      fs.writeFileSync(tmpPath, JSON.stringify(allRecords, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      throw new Error(
        `FileReplayStorePersistenceError: failed to persist authorization state to disk: ${(err as Error).message}`
      );
    }
  }

  public pruneExpired(maxAgeSeconds = 300, nowSec = Math.floor(Date.now() / 1000)): number {
    return this.withLock(() => {
      this.syncFromDisk();
      let pruned = 0;
      for (const [sig, record] of this.recordsBySignature.entries()) {
        const expiryTime = Math.max(record.timestamp, record.consumedAt) + maxAgeSeconds;
        if (nowSec > expiryTime) {
          this.recordsBySignature.delete(sig);
          if (record.nonce) {
            this.recordsByNonce.delete(`${record.walletAddress.toLowerCase()}:${record.nonce}`);
          }
          pruned++;
        }
      }
      if (pruned > 0) {
        this.persistToDisk();
      }
      return pruned;
    });
  }

  public consume(auth: WorkerWalletAuthorization, options?: ConsumeOptions): ConsumeResult {
    return this.withLock(() => {
      this.syncFromDisk();
      const nowSec = options?.nowSec ?? Math.floor(Date.now() / 1000);
      this.pruneExpired(300, nowSec);

      const sigKey = auth.signature.toLowerCase();
      const existing = this.recordsBySignature.get(sigKey);

      if (existing) {
        if (
          options?.allowIdempotentReplay &&
          options?.requestFingerprint &&
          existing.requestFingerprint === options.requestFingerprint
        ) {
          return { isConsumed: true, isIdempotentReplay: true };
        }
        throw new Error('ReplayAttackDetected: worker authorization signature already consumed');
      }

      if (auth.nonce) {
        const nonceKey = `${auth.workerWalletAddress.toLowerCase()}:${auth.nonce}`;
        if (this.recordsByNonce.has(nonceKey)) {
          throw new Error(
            `ReplayAttackDetected: nonce ${auth.nonce} already consumed for wallet ${auth.workerWalletAddress}`
          );
        }
      }

      const record: ConsumedAuthRecord = {
        signature: sigKey,
        nonce: auth.nonce,
        walletAddress: auth.workerWalletAddress.toLowerCase(),
        action: auth.action,
        timestamp: auth.timestamp,
        consumedAt: nowSec,
        requestId: options?.requestId,
        requestFingerprint: options?.requestFingerprint,
      };

      this.recordsBySignature.set(sigKey, record);
      if (auth.nonce) {
        this.recordsByNonce.set(`${auth.workerWalletAddress.toLowerCase()}:${auth.nonce}`, record);
      }

      this.persistToDisk();
      return { isConsumed: false, isIdempotentReplay: false };
    });
  }

  public isConsumed(auth: WorkerWalletAuthorization): boolean {
    return this.withLock(() => {
      this.syncFromDisk();
      const sigKey = auth.signature.toLowerCase();
      if (this.recordsBySignature.has(sigKey)) return true;
      if (auth.nonce && this.recordsByNonce.has(`${auth.workerWalletAddress.toLowerCase()}:${auth.nonce}`)) return true;
      return false;
    });
  }

  public reset(): void {
    this.withLock(() => {
      this.recordsBySignature.clear();
      this.recordsByNonce.clear();
      try {
        if (fs.existsSync(this.filePath)) {
          fs.unlinkSync(this.filePath);
        }
      } catch {
        // Ignore
      }
    });
  }
}

export const sharedReplayStore: IReplayStore = process.env.GIGVAULT_REPLAY_STORE_PATH
  ? new FileReplayStore(process.env.GIGVAULT_REPLAY_STORE_PATH)
  : new MemoryReplayStore();

export class ReplayProtectionRegistry {
  private store: IReplayStore;

  constructor(store: IReplayStore = sharedReplayStore) {
    this.store = store;
  }

  public consume(auth: WorkerWalletAuthorization, options?: ConsumeOptions): ConsumeResult {
    return this.store.consume(auth, options);
  }

  public isConsumed(auth: WorkerWalletAuthorization): boolean {
    return this.store.isConsumed(auth);
  }

  public reset(): void {
    this.store.reset();
  }
}

export const defaultReplayRegistry = new ReplayProtectionRegistry(sharedReplayStore);

/**
 * Sign authorization message using an ethers Wallet.
 */
export async function signWorkerAuthorization(
  params: {
    action: WorkerActionType;
    workerWalletAddress: string;
    consentId: string;
    expectedPassportId: number;
    timestamp?: number;
    chainId?: number;
    nonce?: string;
  },
  wallet: { signMessage: (message: string | Uint8Array) => Promise<string> }
): Promise<WorkerWalletAuthorization> {
  const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000);
  const nonce = params.nonce ?? crypto.randomUUID();
  const msg = formatWorkerAuthMessage({
    action: params.action,
    workerWalletAddress: params.workerWalletAddress,
    consentId: params.consentId,
    expectedPassportId: params.expectedPassportId,
    timestamp,
    chainId: params.chainId,
    nonce,
  });

  const signature = await wallet.signMessage(msg);

  return {
    action: params.action,
    workerWalletAddress: params.workerWalletAddress.toLowerCase().trim(),
    consentId: params.consentId.trim(),
    expectedPassportId: params.expectedPassportId,
    timestamp,
    signature,
    chainId: params.chainId,
    nonce,
  };
}

/**
 * Cryptographically verify worker wallet authorization signature.
 * Throws if signature is forged, signer mismatches, or timestamp is stale.
 * 
 * Invariant:
 * Enforces trusted server clock freshness check. Never permits client-supplied
 * backdated historical timestamps to revive expired authorizations.
 */
export function verifyWorkerAuthorization(
  auth: WorkerWalletAuthorization,
  maxAgeSeconds = 300, // 5 minutes freshness window
  trustedServerTimeSec?: number
): boolean {
  if (!auth.signature || typeof auth.signature !== 'string') {
    throw new Error('Worker wallet authorization signature missing');
  }

  // Always use trusted server clock
  const nowSec = trustedServerTimeSec ?? Math.floor(Date.now() / 1000);

  // Freshness check against trusted server time
  if (nowSec - auth.timestamp > maxAgeSeconds) {
    throw new Error(`Worker wallet authorization expired: signed at ${auth.timestamp}, server time ${nowSec}`);
  }
  if (auth.timestamp > nowSec + 60) {
    throw new Error(`Worker wallet authorization timestamp is in the future: ${auth.timestamp}`);
  }

  const msg = formatWorkerAuthMessage({
    action: auth.action,
    workerWalletAddress: auth.workerWalletAddress,
    consentId: auth.consentId,
    expectedPassportId: auth.expectedPassportId,
    timestamp: auth.timestamp,
    chainId: auth.chainId,
    nonce: auth.nonce,
  });

  let recoveredAddress: string;
  try {
    recoveredAddress = ethers.verifyMessage(msg, auth.signature);
  } catch (err: any) {
    throw new Error(`Failed to recover wallet signer: ${err.message}`);
  }

  if (recoveredAddress.toLowerCase() !== auth.workerWalletAddress.toLowerCase()) {
    // Try legacy format without Application header if needed for compatibility
    const legacyLines = [
      'GigVault Worker Action Authorization',
      `Action: ${auth.action}`,
      `Wallet: ${auth.workerWalletAddress.toLowerCase().trim()}`,
      `Consent: ${auth.consentId.trim()}`,
      `Expected Passport ID: ${auth.expectedPassportId}`,
      `Timestamp: ${auth.timestamp}`,
    ];
    if (auth.chainId !== undefined) legacyLines.push(`Chain ID: ${auth.chainId}`);
    if (auth.nonce !== undefined) legacyLines.push(`Nonce: ${auth.nonce}`);
    const legacyMsg = legacyLines.join('\n');
    try {
      const legacyRecovered = ethers.verifyMessage(legacyMsg, auth.signature);
      if (legacyRecovered.toLowerCase() === auth.workerWalletAddress.toLowerCase()) {
        recoveredAddress = legacyRecovered;
      }
    } catch {
      // ignore
    }
  }

  if (recoveredAddress.toLowerCase() !== auth.workerWalletAddress.toLowerCase()) {
    throw new Error(
      `Worker authorization signer mismatch: recovered ${recoveredAddress.toLowerCase()} != claimed ${auth.workerWalletAddress.toLowerCase()}`
    );
  }

  return true;
}
