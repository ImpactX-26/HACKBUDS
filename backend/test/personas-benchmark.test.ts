/**
 * GigVault - Seven Personas Benchmark & Profile Validation Tests
 * 
 * Verifies that all 7 approved synthetic personas produce their exact locked profiles
 * when passed through the full pipeline (FIP -> Verification -> Classification -> Calendar Aggregation).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MockFIPStorage } from '../src/fip/storage.js';
import { ConsentService } from '../src/fip/consent-service.js';
import { MockFIPService } from '../src/fip/fip-service.js';
import { AttestationService } from '../src/evidence/attestation-service.js';
import { PERSONAS } from '../src/fip/personas/index.js';

describe('Seven Personas Benchmark & Profile Validation', () => {
  const referenceCutoff = Date.UTC(2026, 9, 8, 12, 0, 0) / 1000; // Oct 8, 2026

  function runAttestationForPersona(personaKey: keyof typeof PERSONAS, dirVersion = 2) {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage);
    const fipService = new MockFIPService(storage, consentService);
    const attestationService = new AttestationService(fipService, [storage.getPublicKeyPem()]);

    const persona = PERSONAS[personaKey];
    const consent = consentService.createConsent({
      accountId: persona.accountId,
      durationSeconds: 3600,
      toTimestamp: referenceCutoff,
    });

    return attestationService.attestWorkerEvidence({
      consentId: consent.consentId,
      workerWalletAddress: '0x999999cf1046e68e36E1aA2E0E07105eDDD1f08E',
      workerIdentityNullifier: persona.identityNullifierHash,
      expectedPassportId: 101,
      sourceDirectoryVersion: dirVersion,
      cutoffTimestamp: referenceCutoff,
    });
  }

  it('Ramesh Kumar (Swiggy Hero): passes WelfareVault and Microcredit thresholds', () => {
    const res = runAttestationForPersona('RAMESH');
    assert.strictEqual(res.verified, true);

    // 1. History tenure check: earliest start date should be Jan 2024 (over 2.5 years ago)
    const verifiedDaysAgo = Math.floor(referenceCutoff / 86400) - res.verifiedHistoryStartDate;
    assert.ok(verifiedDaysAgo > 900, `Ramesh must have >900 days tenure, got ${verifiedDaysAgo}`);

    // 2. Last 12 completed months activity (indices 24 to 35)
    const last12MonthsActivity = res.monthlyActivity.slice(24, 36);
    const activeMonthsCount12 = last12MonthsActivity.reduce((a: number, b: number) => a + b, 0);
    assert.strictEqual(activeMonthsCount12, 12, 'Ramesh must have 12/12 active months in past year');

    // 3. Last 6 completed months average income (indices 30 to 35)
    const last6MonthsIncome = res.monthlyGigIncomeTotals.slice(30, 36);
    const avgIncomePaise = last6MonthsIncome.reduce((a, b) => a + b, 0) / 6;
    assert.ok(
      avgIncomePaise >= 2000000,
      `Ramesh avg income must be >= Rs 20,000 (2,000,000 paise), got Rs ${avgIncomePaise / 100}`
    );

    // 4. Last 52 completed weeks activity (indices 104 to 155)
    const last52WeeksActivity = res.weeklyActivity.slice(104, 156);
    const activeWeeksCount = last52WeeksActivity.reduce((a: number, b: number) => a + b, 0);
    assert.ok(activeWeeksCount >= 44, `Ramesh must have >= 44 active weeks out of 52, got ${activeWeeksCount}`);
  });

  it('Suresh Gowda (Uber + Ola): aggregates multi-platform earnings meeting loan target', () => {
    const res = runAttestationForPersona('SURESH');
    assert.strictEqual(res.verified, true);

    // Last 6 completed months average income
    const last6MonthsIncome = res.monthlyGigIncomeTotals.slice(30, 36);
    const avgIncomePaise = last6MonthsIncome.reduce((a, b) => a + b, 0) / 6;
    assert.ok(
      avgIncomePaise >= 2000000,
      `Suresh combined avg income must be >= Rs 20,000, got Rs ${avgIncomePaise / 100}`
    );

    // Last 12 completed months active months
    const last12MonthsActivity = res.monthlyActivity.slice(24, 36);
    const activeMonthsCount12 = last12MonthsActivity.reduce((a: number, b: number) => a + b, 0);
    assert.ok(activeMonthsCount12 >= 10, `Suresh must have >= 10 active months out of 12, got ${activeMonthsCount12}`);
  });

  it('Imran Pasha (Cab Driver): passes income (>Rs 20k) but FAILS 9/12 activity with exactly 8/12', () => {
    const res = runAttestationForPersona('IMRAN');
    assert.strictEqual(res.verified, true);

    // 1. Average income in last 6 completed months is >= Rs 20,000 (PASSES income)
    const last6MonthsIncome = res.monthlyGigIncomeTotals.slice(30, 36);
    const avgIncomePaise = last6MonthsIncome.reduce((a, b) => a + b, 0) / 6;
    assert.ok(
      avgIncomePaise >= 2000000,
      `Imran avg income must exceed Rs 20,000, got Rs ${avgIncomePaise / 100}`
    );

    // 2. Active months in last 12 completed months must be EXACTLY 8/12!
    const last12MonthsActivity = res.monthlyActivity.slice(24, 36);
    const activeMonthsCount12 = last12MonthsActivity.reduce((a: number, b: number) => a + b, 0);
    assert.strictEqual(
      activeMonthsCount12,
      8,
      `Imran must have EXACTLY 8 active months out of 12, got ${activeMonthsCount12}`
    );
    // This directly confirms that Microcredit's requirement of 9/12 will fail without fraud!
  });

  it('Manjunath S (Urban Company): FAILS 6-month welfare history (~4 months tenure)', () => {
    const res = runAttestationForPersona('MANJUNATH');
    assert.strictEqual(res.verified, true);

    // History duration in days
    const daysTenure = Math.floor(referenceCutoff / 86400) - res.verifiedHistoryStartDate;
    // 4 months is ~120 days. 6 months is ~180 days.
    assert.ok(
      daysTenure < 150,
      `Manjunath tenure must be ~4 months (<150 days), got ${daysTenure} days`
    );
    assert.ok(
      daysTenure >= 100,
      `Manjunath tenure must be at least ~100 days, got ${daysTenure} days`
    );
  });

  it('Venkatesh R (Porter): verifies clustered payouts without irregular classification', () => {
    const res = runAttestationForPersona('VENKATESH');
    assert.strictEqual(res.verified, true);

    // Adequate history (>1.5 years)
    const daysTenure = Math.floor(referenceCutoff / 86400) - res.verifiedHistoryStartDate;
    assert.ok(daysTenure > 500, `Venkatesh must have >500 days history, got ${daysTenure}`);

    // Active in at least 9 of 12 months despite uneven clusters
    const last12MonthsActivity = res.monthlyActivity.slice(24, 36);
    const activeMonthsCount12 = last12MonthsActivity.reduce((a: number, b: number) => a + b, 0);
    assert.ok(activeMonthsCount12 >= 9, `Venkatesh must have >= 9 active months, got ${activeMonthsCount12}`);
  });

  it('Farhan Ali (Swiggy -> Zomato): verifies longitudinal tenure across platform transition', () => {
    const res = runAttestationForPersona('FARHAN', 2);
    assert.strictEqual(res.verified, true);

    // Tenure should start in April 2024 (>2 years tenure)
    const daysTenure = Math.floor(referenceCutoff / 86400) - res.verifiedHistoryStartDate;
    assert.ok(daysTenure > 800, `Farhan must have >800 days tenure, got ${daysTenure}`);

    // Active throughout last 12 months under same passport
    const last12MonthsActivity = res.monthlyActivity.slice(24, 36);
    const activeMonthsCount12 = last12MonthsActivity.reduce((a: number, b: number) => a + b, 0);
    assert.strictEqual(activeMonthsCount12, 12, 'Farhan must have 12/12 active months across platform transition');
  });

  it('Arjun Mehta (Security Persona): baseline is valid and properly formed', () => {
    const res = runAttestationForPersona('ARJUN', 2);
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.identityNullifierHash, PERSONAS.ARJUN.identityNullifierHash);
    assert.ok(res.monthlyGigIncomeTotals.reduce((a, b) => a + b, 0) > 0);
  });
});
