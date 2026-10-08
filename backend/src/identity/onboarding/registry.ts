/**
 * GigVault - Worker Onboarding Registry
 * 
 * Durable, privacy-conscious registry maintaining bindings among:
 * - Internal worker identifier
 * - Verified EVM wallet address
 * - Verified identity nullifier and trust mode
 * - Protected phone reference (keyed HMAC hash + display mask)
 * 
 * Non-negotiable Invariants:
 * 1. 1-to-1 uniqueness: An active identity nullifier cannot be claimed by another worker.
 * 2. An active wallet cannot belong to multiple worker identities.
 * 3. An active phone cannot be silently claimed by another identity.
 * 4. Phone possession alone CANNOT take over an existing Aadhaar-linked identity.
 * 5. Concurrent registrations are serialized via atomic locking to prevent race conditions.
 * 6. Zero plaintext Aadhaar numbers or phone numbers stored.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  type WorkerOnboardingRecord,
  IdentityNullifierAlreadyClaimedError,
  WalletAlreadyBoundError,
  PhoneAlreadyBoundError,
  UnauthorizedRecoveryError,
} from './types.js';

export interface IWorkerOnboardingRegistry {
  findByWorkerId(workerId: string): Promise<WorkerOnboardingRecord | null>;
  findByWallet(walletAddress: string): Promise<WorkerOnboardingRecord | null>;
  findByIdentityNullifier(nullifier: string): Promise<WorkerOnboardingRecord | null>;
  findByPhoneHash(phoneHash: string): Promise<WorkerOnboardingRecord | null>;
  registerWorker(record: WorkerOnboardingRecord): Promise<void>;
  rebindWallet(nullifier: string, newWalletAddress: string, auditReason: string): Promise<void>;
  revokeWorker(workerId: string, reason: string): Promise<void>;
  listActiveWorkers(): Promise<WorkerOnboardingRecord[]>;
}

export interface WorkerOnboardingRegistryOptions {
  storageFilePath?: string;
}

export class WorkerOnboardingRegistry implements IWorkerOnboardingRegistry {
  private recordsByWorkerId: Map<string, WorkerOnboardingRecord> = new Map();
  private storageFilePath?: string;
  private writeLock: Promise<void> = Promise.resolve();

  constructor(options: WorkerOnboardingRegistryOptions = {}) {
    this.storageFilePath = options.storageFilePath;
    if (this.storageFilePath) {
      this.loadFromFile();
    }
  }

  private loadFromFile(): void {
    if (!this.storageFilePath || !fs.existsSync(this.storageFilePath)) {
      return;
    }
    try {
      const data = fs.readFileSync(this.storageFilePath, 'utf8');
      const parsed = JSON.parse(data) as WorkerOnboardingRecord[];
      for (const rec of parsed) {
        this.recordsByWorkerId.set(rec.workerId, rec);
      }
    } catch (err) {
      // Fail closed if corrupted
      throw new Error(`WorkerOnboardingRegistry: failed to read storage file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async persistToFile(): Promise<void> {
    if (!this.storageFilePath) return;
    const records = Array.from(this.recordsByWorkerId.values());
    const tempPath = `${this.storageFilePath}.${Date.now()}.tmp`;
    const dir = path.dirname(this.storageFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(tempPath, JSON.stringify(records, null, 2), 'utf8');
    await fs.promises.rename(tempPath, this.storageFilePath);
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.writeLock;
    let resolveLock!: () => void;
    this.writeLock = new Promise<void>((r) => {
      resolveLock = r;
    });
    try {
      await prev;
      return await fn();
    } finally {
      resolveLock();
    }
  }

  public async findByWorkerId(workerId: string): Promise<WorkerOnboardingRecord | null> {
    const clean = workerId.trim();
    const rec = this.recordsByWorkerId.get(clean);
    return rec ? { ...rec } : null;
  }

  public async findByWallet(walletAddress: string): Promise<WorkerOnboardingRecord | null> {
    const clean = walletAddress.toLowerCase().trim();
    for (const rec of this.recordsByWorkerId.values()) {
      if (rec.status === 'ACTIVE' && rec.walletAddress.toLowerCase().trim() === clean) {
        return { ...rec };
      }
    }
    return null;
  }

  public async findByIdentityNullifier(nullifier: string): Promise<WorkerOnboardingRecord | null> {
    const clean = nullifier.toLowerCase().trim();
    for (const rec of this.recordsByWorkerId.values()) {
      if (rec.status === 'ACTIVE' && rec.identityNullifier.toLowerCase().trim() === clean) {
        return { ...rec };
      }
    }
    return null;
  }

  public async findByPhoneHash(phoneHash: string): Promise<WorkerOnboardingRecord | null> {
    const clean = phoneHash.trim();
    for (const rec of this.recordsByWorkerId.values()) {
      if (rec.status === 'ACTIVE' && rec.phoneHash.trim() === clean) {
        return { ...rec };
      }
    }
    return null;
  }

  public async registerWorker(record: WorkerOnboardingRecord): Promise<void> {
    return this.withLock(async () => {
      const cleanNullifier = record.identityNullifier.toLowerCase().trim();
      const cleanWallet = record.walletAddress.toLowerCase().trim();
      const cleanPhoneHash = record.phoneHash.trim();

      // 1. Invariant check: identityNullifier uniqueness among active records
      for (const rec of this.recordsByWorkerId.values()) {
        if (rec.status === 'ACTIVE') {
          if (rec.identityNullifier.toLowerCase().trim() === cleanNullifier) {
            throw new IdentityNullifierAlreadyClaimedError(record.identityNullifier, rec.walletAddress);
          }
          if (rec.walletAddress.toLowerCase().trim() === cleanWallet) {
            throw new WalletAlreadyBoundError(record.walletAddress, rec.workerId);
          }
          if (rec.phoneHash.trim() === cleanPhoneHash) {
            throw new PhoneAlreadyBoundError(record.phoneMasked);
          }
        }
      }

      // Store normalized record
      this.recordsByWorkerId.set(record.workerId, {
        ...record,
        walletAddress: cleanWallet,
        identityNullifier: cleanNullifier,
        phoneHash: cleanPhoneHash,
      });

      await this.persistToFile();
    });
  }

  public async rebindWallet(nullifier: string, newWalletAddress: string, auditReason: string): Promise<void> {
    return this.withLock(async () => {
      const cleanNullifier = nullifier.toLowerCase().trim();
      const cleanNewWallet = newWalletAddress.toLowerCase().trim();

      let targetRecord: WorkerOnboardingRecord | null = null;
      for (const rec of this.recordsByWorkerId.values()) {
        if (rec.status === 'ACTIVE') {
          if (rec.identityNullifier.toLowerCase().trim() === cleanNullifier) {
            targetRecord = rec;
          } else if (rec.walletAddress.toLowerCase().trim() === cleanNewWallet) {
            throw new WalletAlreadyBoundError(newWalletAddress, rec.workerId);
          }
        }
      }

      if (!targetRecord) {
        throw new UnauthorizedRecoveryError(`Identity nullifier ${nullifier} not found in active registry`);
      }

      targetRecord.walletAddress = cleanNewWallet;
      targetRecord.bindingVersion += 1;
      targetRecord.updatedAt = Date.now();
      targetRecord.auditLog.push({
        action: 'WALLET_REBOUND',
        timestamp: Date.now(),
        details: auditReason,
      });

      await this.persistToFile();
    });
  }

  public async revokeWorker(workerId: string, reason: string): Promise<void> {
    return this.withLock(async () => {
      const rec = this.recordsByWorkerId.get(workerId);
      if (!rec) {
        return;
      }
      rec.status = 'REVOKED';
      rec.updatedAt = Date.now();
      rec.auditLog.push({
        action: 'WORKER_REVOKED',
        timestamp: Date.now(),
        details: reason,
      });
      await this.persistToFile();
    });
  }

  public async listActiveWorkers(): Promise<WorkerOnboardingRecord[]> {
    return Array.from(this.recordsByWorkerId.values())
      .filter((r) => r.status === 'ACTIVE')
      .map((r) => ({ ...r }));
  }
}
