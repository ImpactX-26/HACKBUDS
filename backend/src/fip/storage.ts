/**
 * GigVault - Mock FIP In-Memory Storage
 * 
 * Independently maintains:
 * - Pre-established trusted bank accounts and synthetic account-owner identity mappings
 * - Raw transaction histories for all seven personas
 * - Consent records
 * - Mock FIP cryptographic signing keys
 * 
 * Note: Simulates a separate bank/FIP trust boundary. Worker-supplied identity
 * strings are NEVER used to overwrite bank-side owner mappings.
 */

import { generateFipKeyPair, type KeyPair } from './crypto.js';
import { PERSONAS, getTransactionsForPersona } from './personas/index.js';
import type { AccountOwnerBinding, ConsentRecord, RawTransaction } from './types.js';

export class MockFIPStorage {
  private keyPair: KeyPair;
  private accounts: Map<string, AccountOwnerBinding> = new Map();
  private transactions: Map<string, RawTransaction[]> = new Map();
  private consents: Map<string, ConsentRecord> = new Map();

  constructor(customKeyPair?: KeyPair) {
    this.keyPair = customKeyPair || generateFipKeyPair();
    this.seedPersonas();
  }

  private seedPersonas(): void {
    const nowSec = Math.floor(Date.now() / 1000);

    for (const persona of Object.values(PERSONAS)) {
      // 1. Store pre-established bank KYC account-owner binding
      const binding: AccountOwnerBinding = {
        accountId: persona.accountId,
        ownerName: persona.name,
        identityNullifierHash: persona.identityNullifierHash,
        verifiedAt: nowSec - 86400 * 30, // Verified 30 days prior
      };
      this.accounts.set(persona.accountId, binding);

      // 2. Load authentic synthetic transactions
      const txns = getTransactionsForPersona(persona.id);
      this.transactions.set(persona.accountId, txns);
    }
  }

  public getKeyPair(): KeyPair {
    return this.keyPair;
  }

  public getPublicKeyPem(): string {
    return this.keyPair.publicKeyPem;
  }

  public getAccountBinding(accountId: string): AccountOwnerBinding | undefined {
    return this.accounts.get(accountId);
  }

  public getTransactions(accountId: string): RawTransaction[] {
    return this.transactions.get(accountId) || [];
  }

  public saveConsent(consent: ConsentRecord): void {
    this.consents.set(consent.consentId, consent);
  }

  public getConsent(consentId: string): ConsentRecord | undefined {
    return this.consents.get(consentId);
  }

  public updateConsentStatus(consentId: string, status: ConsentRecord['status']): void {
    const consent = this.consents.get(consentId);
    if (consent) {
      consent.status = status;
      if (status === 'REVOKED') {
        consent.revokedAt = Math.floor(Date.now() / 1000);
      }
    }
  }
}

// Singleton storage instance for application use
export const defaultFipStorage = new MockFIPStorage();
