/**
 * GigVault - Mock Bank / FIP Service
 * 
 * Provides server-to-server retrieval of cryptographically signed financial provenance:
 * - Fetches records strictly bound to a valid, active consent record
 * - Enforces account ownership and consented date range
 * - Signs payload with Mock FIP's dedicated secp256k1 private key
 * - Returns SignedFIPEnvelope containing payload, hash, signature, and public key
 */

import { hashPayload, signPayloadHash } from './crypto.js';
import type { ConsentService } from './consent-service.js';
import type { MockFIPStorage } from './storage.js';
import type { SignedFIPEnvelope, SignedFIPPayload } from './types.js';

export class MockFIPService {
  private storage: MockFIPStorage;
  private consentService: ConsentService;
  private fipId: string;

  constructor(storage: MockFIPStorage, consentService: ConsentService, fipId = 'MOCK_APNA_BANK_FIP_01') {
    this.storage = storage;
    this.consentService = consentService;
    this.fipId = fipId;
  }

  /**
   * Server-to-server signed transaction data fetch by consentId.
   * 
   * Security Invariant:
   * Consent validity is evaluated against trusted server time. Caller-supplied
   * evidenceCutoffTimestamp is strictly used to bound transactions for calendar aggregation
   * and NEVER influences consent validity or expiration.
   */
  public fetchSignedDataByConsent(
    consentId: string,
    evidenceCutoffTimestamp?: number,
    trustedServerTimeSec?: number
  ): SignedFIPEnvelope {
    // 1. Retrieve and validate consent using trusted server time (NOT evidence cutoff!)
    const consent = this.consentService.getConsent(consentId, trustedServerTimeSec);

    if (consent.status === 'EXPIRED') {
      throw new Error(`FIP consent expired: consentId ${consentId} has passed expiry`);
    }
    if (consent.status === 'REVOKED') {
      throw new Error(`FIP consent revoked: consentId ${consentId} was revoked by account owner`);
    }
    if (consent.status !== 'ACTIVE') {
      throw new Error(`FIP consent inactive: consentId ${consentId} has status ${consent.status}`);
    }

    // 2. Retrieve bank-side account binding
    const accountBinding = this.storage.getAccountBinding(consent.accountId);
    if (!accountBinding) {
      throw new Error(`Account record missing for consented account: ${consent.accountId}`);
    }

    // 3. Fetch transactions within consented scope and optional evidence cutoff
    const allTxns = this.storage.getTransactions(consent.accountId);
    const fromTs = consent.scope.fromTimestamp;
    const maxToTs = consent.scope.toTimestamp;
    const effectiveToTs = evidenceCutoffTimestamp !== undefined
      ? Math.min(maxToTs, evidenceCutoffTimestamp)
      : maxToTs;

    const scopedTxns = allTxns.filter((txn) => txn.timestamp >= fromTs && txn.timestamp <= effectiveToTs);

    // 4. Construct canonical signed payload
    const nowSec = trustedServerTimeSec ?? Math.floor(Date.now() / 1000);
    const payload: SignedFIPPayload = {
      schemaVersion: 'GIGVAULT_FIP_MOCK_V1',
      fipId: this.fipId,
      consentId: consent.consentId,
      accountId: consent.accountId,
      accountOwnerBinding: accountBinding,
      dataRange: {
        fromTimestamp: fromTs,
        toTimestamp: effectiveToTs,
      },
      transactions: scopedTxns,
      generatedAt: nowSec,
    };

    // 5. Cryptographically sign the payload
    const payloadHash = hashPayload(payload);
    const privateKeyPem = this.storage.getKeyPair().privateKeyPem;
    const signature = signPayloadHash(payloadHash, privateKeyPem);
    const publicKeyPem = this.storage.getPublicKeyPem();

    return {
      payload,
      payloadHash,
      signature,
      fipPublicKey: publicKeyPem,
    };
  }
}
