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
import type { VerifiedIdentityAssertion, WorkerWalletAuthorization } from '../identity/types.js';
import { verifyWorkerAuthorization } from '../identity/wallet-auth.js';
import { defaultMockIdp, MockIdentityProvider } from '../identity/mock-idp.js';

export interface CreateConsentParams {
  accountId: string;
  authorizedIdentityNullifier?: string; // Identity nullifier of caller authorized to access this account
  authorizedWalletAddress?: string;
  durationSeconds?: number; // Default 3600 (1 hour)
  fromTimestamp?: number; // Start of transaction window (Unix seconds)
  toTimestamp?: number; // End of transaction window (Unix seconds)
  identityAssertion?: VerifiedIdentityAssertion;
  walletAuthorization?: WorkerWalletAuthorization;
}

export class ConsentService {
  private storage: MockFIPStorage;
  private idp: MockIdentityProvider;

  constructor(storage: MockFIPStorage, idp: MockIdentityProvider = defaultMockIdp) {
    this.storage = storage;
    this.idp = idp;
  }

  public getIdp(): MockIdentityProvider {
    return this.idp;
  }

  /**
   * Create a new consent record for an authentic bank account.
   * Enforces that caller must be authorized to consent for the account.
   */
  public createConsent(params: CreateConsentParams): ConsentRecord {
    const {
      accountId,
      authorizedIdentityNullifier,
      durationSeconds = 3600, // 1 hour default validity
      fromTimestamp = 0,
      toTimestamp = Math.floor(Date.now() / 1000),
      identityAssertion,
      walletAuthorization,
    } = params;

    // Verify account exists in Bank/FIP
    const account = this.storage.getAccountBinding(accountId);
    if (!account) {
      throw new Error(`Account not found in Mock FIP: ${accountId}`);
    }

    let authNullifier = authorizedIdentityNullifier ? authorizedIdentityNullifier.toLowerCase().trim() : undefined;
    let authWallet = params.authorizedWalletAddress ? params.authorizedWalletAddress.toLowerCase().trim() : undefined;

    if (identityAssertion && walletAuthorization) {
      const verifiedId = this.idp.verifyAssertion(identityAssertion);
      verifyWorkerAuthorization(walletAuthorization);

      if (walletAuthorization.workerWalletAddress.toLowerCase() !== verifiedId.workerWalletAddress.toLowerCase()) {
        throw new Error('UnauthorizedConsentCreation: wallet authorization does not match identity assertion wallet');
      }
      if (walletAuthorization.action !== 'CREATE_CONSENT') {
        throw new Error(`UnauthorizedConsentCreation: wallet authorization action must be CREATE_CONSENT, got ${walletAuthorization.action}`);
      }

      authNullifier = verifiedId.workerIdentityNullifier.toLowerCase();
      authWallet = walletAuthorization.workerWalletAddress.toLowerCase();
    }

    // Account ownership authorization check
    if (authNullifier) {
      if (account.identityNullifierHash.toLowerCase().trim() !== authNullifier) {
        throw new Error(
          `UnauthorizedConsentCreation: identity ${authNullifier} is not authorized to create consent for account ${accountId}`
        );
      }
    } else {
      authNullifier = account.identityNullifierHash.toLowerCase().trim();
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
      authorizedIdentityNullifier: authNullifier,
      authorizedWalletAddress: authWallet,
      status: 'ACTIVE',
      scope,
      createdAt: nowSec,
      expiresAt: nowSec + durationSeconds,
    };

    this.storage.saveConsent(consent);
    return consent;
  }

  /**
   * Retrieve consent and evaluate expiration state against trusted server clock.
   */
  public getConsent(consentId: string, trustedServerTimeSec?: number): ConsentRecord {
    const consent = this.storage.getConsent(consentId);
    if (!consent) {
      throw new Error(`Consent record not found: ${consentId}`);
    }

    const nowSec = trustedServerTimeSec ?? Math.floor(Date.now() / 1000);

    // If status is ACTIVE but expiry has passed according to server clock, transition to EXPIRED
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
