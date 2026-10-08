/**
 * GigVault - Classifier & Directory Versioning Tests
 * 
 * Verifies:
 * - Curated remitter matching (VPA, legal entity name, account number)
 * - Narration alone is NEVER sufficient to classify gig income
 * - Friend/personal transfers and non-gig debits are excluded
 * - Historical directory version reconstruction (v1 vs v2)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TransactionClassifier } from '../src/evidence/classifier.js';
import { getDirectoryForVersion } from '../src/evidence/directory/registry.js';
import type { RawTransaction } from '../src/fip/types.js';

describe('Conservative Transaction Classifier & Payout Directory', () => {
  it('should count authentic credits from recognized gig platforms', () => {
    const classifier = new TransactionClassifier(2); // v2 includes Swiggy and Zomato

    const swiggyTxn: RawTransaction = {
      txnId: 'T1',
      timestamp: 1700000000,
      amountMinor: 750000,
      currency: 'INR',
      direction: 'CREDIT',
      rail: 'UPI',
      remitter: {
        name: 'BUNDL TECHNOLOGIES PRIVATE LIMITED',
        vpa: 'bundltechnologies@icici',
      },
      reference: 'UTR123',
      narration: 'UPI/SWIGGY_PAYOUT',
    };

    const res = classifier.classifyTransaction(swiggyTxn);
    assert.strictEqual(res.category, 'COUNTED');
    assert.strictEqual(res.isGigIncome, true);
    assert.strictEqual(res.matchedPlatform, 'Swiggy');
  });

  it('MUST EXCLUDE: narration mentioning platform from unrecognized remitter (narration spoofing)', () => {
    const classifier = new TransactionClassifier(2);

    const spoofedTxn: RawTransaction = {
      txnId: 'T2',
      timestamp: 1700000000,
      amountMinor: 500000,
      currency: 'INR',
      direction: 'CREDIT',
      rail: 'UPI',
      remitter: {
        name: 'RANDOM INDIVIDUAL',
        vpa: 'randomguy@okhdfcbank',
      },
      reference: 'UTR999',
      narration: 'UPI/SWIGGY PAYOUT FROM FRIEND/BUNDL', // Deceptive narration
    };

    const res = classifier.classifyTransaction(spoofedTxn);
    assert.strictEqual(res.category, 'EXCLUDED_UNRECOGNIZED');
    assert.strictEqual(res.isGigIncome, false);
    assert.ok(res.classificationReason.includes('narration alone is insufficient'));
  });

  it('should exclude debits from gig income regardless of remitter or narration', () => {
    const classifier = new TransactionClassifier(2);

    const debitTxn: RawTransaction = {
      txnId: 'T3',
      timestamp: 1700000000,
      amountMinor: 100000,
      currency: 'INR',
      direction: 'DEBIT',
      rail: 'UPI',
      remitter: {
        name: 'BUNDL TECHNOLOGIES PRIVATE LIMITED',
        vpa: 'bundltechnologies@icici',
      },
      reference: 'UTR456',
      narration: 'UPI/SWIGGY/ADJUSTMENT',
    };

    const res = classifier.classifyTransaction(debitTxn);
    assert.strictEqual(res.category, 'NOT_RELEVANT_DEBIT');
    assert.strictEqual(res.isGigIncome, false);
  });

  it('should exclude friend and personal transfers', () => {
    const classifier = new TransactionClassifier(2);

    const friendTxn: RawTransaction = {
      txnId: 'T4',
      timestamp: 1700000000,
      amountMinor: 50000,
      currency: 'INR',
      direction: 'CREDIT',
      rail: 'UPI',
      remitter: {
        name: 'RAHUL SHARMA',
        vpa: 'rahul@icici',
      },
      reference: 'UTR789',
      narration: 'UPI/FRIEND REPAYMENT',
    };

    const res = classifier.classifyTransaction(friendTxn);
    assert.strictEqual(res.category, 'EXCLUDED_PERSONAL');
    assert.strictEqual(res.isGigIncome, false);
  });

  it('should accurately reconstruct historical directory versions (v1 vs v2)', () => {
    // Version 1 had 5 platforms: Swiggy, Uber, Ola, Urban Company, Porter (Zomato was NOT in v1)
    const dirV1 = getDirectoryForVersion(1);
    const platformsV1 = dirV1.entries.map((e) => e.platformName);
    assert.ok(platformsV1.includes('Swiggy'));
    assert.ok(platformsV1.includes('Uber'));
    assert.ok(!platformsV1.includes('Zomato'), 'v1 must not include Zomato');

    // Version 2 introduced Zomato
    const dirV2 = getDirectoryForVersion(2);
    const platformsV2 = dirV2.entries.map((e) => e.platformName);
    assert.ok(platformsV2.includes('Zomato'), 'v2 must include Zomato');

    const zomatoTxn: RawTransaction = {
      txnId: 'T5',
      timestamp: 1700000000,
      amountMinor: 600000,
      currency: 'INR',
      direction: 'CREDIT',
      rail: 'UPI',
      remitter: {
        name: 'ZOMATO LIMITED',
        vpa: 'zomatopayouts@hdfcbank',
      },
      reference: 'UTRZOM1',
      narration: 'UPI/ZOMATO_PAYOUT',
    };

    // Under directory v1 classifier: Zomato is unrecognized
    const classifierV1 = new TransactionClassifier(1);
    const resV1 = classifierV1.classifyTransaction(zomatoTxn);
    assert.strictEqual(resV1.isGigIncome, false, 'Zomato must not count under directory v1');

    // Under directory v2 classifier: Zomato is counted
    const classifierV2 = new TransactionClassifier(2);
    const resV2 = classifierV2.classifyTransaction(zomatoTxn);
    assert.strictEqual(resV2.isGigIncome, true, 'Zomato must count under directory v2');
    assert.strictEqual(resV2.matchedPlatform, 'Zomato');
  });
});
