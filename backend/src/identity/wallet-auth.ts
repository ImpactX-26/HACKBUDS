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

export class ReplayProtectionRegistry {
  private consumedNonces: Set<string> = new Set();
  private consumedSignatures: Set<string> = new Set();

  public consume(auth: WorkerWalletAuthorization): void {
    const sigKey = auth.signature.toLowerCase();
    if (this.consumedSignatures.has(sigKey)) {
      throw new Error('ReplayAttackDetected: worker authorization signature already consumed');
    }

    if (auth.nonce) {
      const nonceKey = `${auth.workerWalletAddress.toLowerCase()}:${auth.nonce}`;
      if (this.consumedNonces.has(nonceKey)) {
        throw new Error(`ReplayAttackDetected: nonce ${auth.nonce} already consumed for wallet ${auth.workerWalletAddress}`);
      }
      this.consumedNonces.add(nonceKey);
    }

    this.consumedSignatures.add(sigKey);
  }

  public isConsumed(auth: WorkerWalletAuthorization): boolean {
    if (this.consumedSignatures.has(auth.signature.toLowerCase())) return true;
    if (auth.nonce && this.consumedNonces.has(`${auth.workerWalletAddress.toLowerCase()}:${auth.nonce}`)) return true;
    return false;
  }

  public reset(): void {
    this.consumedNonces.clear();
    this.consumedSignatures.clear();
  }
}

export const defaultReplayRegistry = new ReplayProtectionRegistry();

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
