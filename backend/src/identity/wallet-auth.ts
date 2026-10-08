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

export class MemoryReplayStore implements IReplayStore {
  private recordsBySignature = new Map<string, ConsumedAuthRecord>();
  private recordsByNonce = new Map<string, ConsumedAuthRecord>();

  public pruneExpired(maxAgeSeconds = 300, nowSec = Math.floor(Date.now() / 1000)): number {
    let pruned = 0;
    for (const [sig, record] of this.recordsBySignature.entries()) {
      if (nowSec - record.consumedAt > maxAgeSeconds) {
        this.recordsBySignature.delete(sig);
        if (record.nonce) {
          this.recordsByNonce.delete(`${record.walletAddress}:${record.nonce}`);
        }
        pruned++;
      }
    }
    return pruned;
  }

  public consume(auth: WorkerWalletAuthorization, options?: ConsumeOptions): ConsumeResult {
    const nowSec = Math.floor(Date.now() / 1000);
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
 * Zero-cost filesystem-backed replay store.
 * Persists authorization records across actual process restarts and separate OS processes
 * on the same host using atomic file writes.
 * Invariant: Never stores raw financial records, account balances, or evidence snapshots.
 */
export class FileReplayStore implements IReplayStore {
  private filePath: string;
  private recordsBySignature = new Map<string, ConsumedAuthRecord>();
  private recordsByNonce = new Map<string, ConsumedAuthRecord>();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.syncFromDisk();
  }

  public getFilePath(): string {
    return this.filePath;
  }

  private syncFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      if (!raw.trim()) return;
      const records: ConsumedAuthRecord[] = JSON.parse(raw);
      this.recordsBySignature.clear();
      this.recordsByNonce.clear();
      for (const rec of records) {
        this.recordsBySignature.set(rec.signature.toLowerCase(), rec);
        if (rec.nonce) {
          this.recordsByNonce.set(`${rec.walletAddress.toLowerCase()}:${rec.nonce}`, rec);
        }
      }
    } catch {
      // Non-fatal if read temporarily fails; preserves existing memory cache
    }
  }

  private persistToDisk(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const allRecords = Array.from(this.recordsBySignature.values());
      const tmpPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(allRecords, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      throw new Error(
        `FileReplayStorePersistenceError: failed to persist authorization state to disk: ${(err as Error).message}`
      );
    }
  }

  public pruneExpired(maxAgeSeconds = 300, nowSec = Math.floor(Date.now() / 1000)): number {
    this.syncFromDisk();
    let pruned = 0;
    for (const [sig, record] of this.recordsBySignature.entries()) {
      if (nowSec - record.consumedAt > maxAgeSeconds) {
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
  }

  public consume(auth: WorkerWalletAuthorization, options?: ConsumeOptions): ConsumeResult {
    this.syncFromDisk();
    const nowSec = Math.floor(Date.now() / 1000);
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
  }

  public isConsumed(auth: WorkerWalletAuthorization): boolean {
    this.syncFromDisk();
    const sigKey = auth.signature.toLowerCase();
    if (this.recordsBySignature.has(sigKey)) return true;
    if (auth.nonce && this.recordsByNonce.has(`${auth.workerWalletAddress.toLowerCase()}:${auth.nonce}`)) return true;
    return false;
  }

  public reset(): void {
    this.recordsBySignature.clear();
    this.recordsByNonce.clear();
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {
      // Ignore
    }
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
