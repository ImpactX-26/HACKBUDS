/**
 * GigVault - Mock FIP Consent Service
 * 
 * Manages the lifecycle of worker-authorized FIP consent records:
 * - Creation of scoped consents for authentic bank accounts
 * - Expiry management based on validity duration
 * - Explicit revocation
 * - Enforcement of authorized scope and validity period
 */

import crypto from 'node:crypto';
import type { MockFIPStorage } from './storage.js';
import type { ConsentRecord, ConsentScope } from './types.js';

export interface CreateConsentParams {
  accountId: string;
  durationSeconds?: number; // Default 3600 (1 hour)
  fromTimestamp?: number; // Start of transaction window (Unix seconds)
  toTimestamp?: number; // End of transaction window (Unix seconds)
}

export class ConsentService {
  private storage: MockFIPStorage;

  constructor(storage: MockFIPStorage) {
    this.storage = storage;
  }

  /**
   * Create a new consent record for an authentic bank account.
   */
  public createConsent(params: CreateConsentParams): ConsentRecord {
    const {
      accountId,
      durationSeconds = 3600, // 1 hour default validity
      fromTimestamp = 0,
      toTimestamp = Math.floor(Date.now() / 1000),
    } = params;

    // Verify account exists in Bank/FIP
    const account = this.storage.getAccountBinding(accountId);
    if (!account) {
      throw new Error(`Account not found in Mock FIP: ${accountId}`);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const consentId = `CONSENT_${crypto.randomUUID()}`;

    const scope: ConsentScope = {
      accountId,
      fromTimestamp,
      toTimestamp,
      dataTypes: ['TRANSACTIONS', 'PROFILE'],
    };

    const consent: ConsentRecord = {
      consentId,
      accountId,
      status: 'ACTIVE',
      scope,
      createdAt: nowSec,
      expiresAt: nowSec + durationSeconds,
    };

    this.storage.saveConsent(consent);
    return consent;
  }

  /**
   * Retrieve consent and evaluate expiration state.
   */
  public getConsent(consentId: string, currentTimestamp?: number): ConsentRecord {
    const consent = this.storage.getConsent(consentId);
    if (!consent) {
      throw new Error(`Consent record not found: ${consentId}`);
    }

    const nowSec = currentTimestamp ?? Math.floor(Date.now() / 1000);

    // If status is ACTIVE but expiry has passed, transition to EXPIRED
    if (consent.status === 'ACTIVE' && nowSec > consent.expiresAt) {
      this.storage.updateConsentStatus(consentId, 'EXPIRED');
      consent.status = 'EXPIRED';
    }

    return consent;
  }

  /**
   * Explicitly revoke an existing consent.
   */
  public revokeConsent(consentId: string): ConsentRecord {
    const consent = this.getConsent(consentId);
    this.storage.updateConsentStatus(consentId, 'REVOKED');
    consent.status = 'REVOKED';
    consent.revokedAt = Math.floor(Date.now() / 1000);
    return consent;
  }
}
