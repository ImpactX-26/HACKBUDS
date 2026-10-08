/**
 * GigVault - Calendar Aggregation & Time-Bucket Invariant Tests
 * 
 * Verifies:
 * - 36 completed UTC calendar months (oldest to newest)
 * - 156 completed ISO Monday-Sunday weeks (oldest to newest)
 * - Current partial month and current partial week are strictly excluded
 * - Empty periods evaluate to 0
 * - Leap years and month boundary handling
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getCompletedMonthIntervals,
  getCompletedWeekIntervals,
  aggregateEvidenceCalendar,
} from '../src/evidence/calendar.js';
import type { ClassifiedTransaction } from '../src/evidence/classifier.js';

describe('Deterministic Calendar & Time-Bucket Aggregator', () => {
  const referenceCutoff = Date.UTC(2026, 9, 8, 12, 0, 0) / 1000; // 2026-10-08T12:00:00Z (Thursday)

  it('should generate exactly 36 completed UTC months, oldest to newest', () => {
    const months = getCompletedMonthIntervals(referenceCutoff);
    assert.strictEqual(months.length, 36);

    // Latest completed month (index 35) must be September 2026
    const newest = months[35];
    assert.strictEqual(newest.year, 2026);
    assert.strictEqual(newest.month, 9); // September

    // Start of September 2026: 2026-09-01T00:00:00Z
    assert.strictEqual(newest.startTs, Date.UTC(2026, 8, 1, 0, 0, 0) / 1000);
    // End of September 2026: 2026-10-01T00:00:00Z
    assert.strictEqual(newest.endTs, Date.UTC(2026, 9, 1, 0, 0, 0) / 1000);

    // Oldest month (index 0) must be 35 months prior: October 2023
    const oldest = months[0];
    assert.strictEqual(oldest.year, 2023);
    assert.strictEqual(oldest.month, 10); // October 2023

    // Verify chronological order: startTs must strictly increase
    for (let i = 1; i < 36; i++) {
      assert.ok(months[i].startTs > months[i - 1].startTs, `Month ${i} must be after month ${i - 1}`);
      assert.strictEqual(months[i].startTs, months[i - 1].endTs, `Month ${i} start must equal month ${i - 1} end`);
    }
  });

  it('should generate exactly 156 completed ISO Monday-Sunday weeks, oldest to newest', () => {
    const weeks = getCompletedWeekIntervals(referenceCutoff);
    assert.strictEqual(weeks.length, 156);

    // Reference cutoff: Thursday Oct 8, 2026
    // Current week Monday: Oct 5, 2026 00:00:00 UTC
    // Latest completed week (index 155): Sept 28, 2026 to Oct 5, 2026
    const newestWeek = weeks[155];
    const expectedNewestEnd = Date.UTC(2026, 9, 5, 0, 0, 0) / 1000;
    const expectedNewestStart = Date.UTC(2026, 8, 28, 0, 0, 0) / 1000;
    assert.strictEqual(newestWeek.endTs, expectedNewestEnd);
    assert.strictEqual(newestWeek.startTs, expectedNewestStart);

    // Each week interval must be exactly 7 days (604800 seconds)
    for (let i = 0; i < 156; i++) {
      assert.strictEqual(weeks[i].endTs - weeks[i].startTs, 7 * 86400, `Week ${i} must be 7 days`);
      if (i > 0) {
        assert.strictEqual(weeks[i].startTs, weeks[i - 1].endTs, `Week ${i} must be contiguous with ${i - 1}`);
      }
    }
  });

  it('MUST EXCLUDE partial current month transactions even if available', () => {
    // Transaction on Oct 3, 2026 (inside current partial month of Oct 2026)
    const partialMonthTs = Date.UTC(2026, 9, 3, 10, 0, 0) / 1000;
    // Transaction in September 2026 (completed month)
    const completedMonthTs = Date.UTC(2026, 8, 15, 10, 0, 0) / 1000;

    const classifiedTxns: ClassifiedTransaction[] = [
      {
        raw: {
          txnId: 'TX1',
          timestamp: completedMonthTs,
          amountMinor: 800000,
          currency: 'INR',
          direction: 'CREDIT',
          rail: 'UPI',
          remitter: { vpa: 'bundltechnologies@icici' },
          reference: 'REF1',
          narration: 'SWIGGY',
        },
        category: 'COUNTED',
        isGigIncome: true,
        classificationReason: 'Counted · Swiggy',
      },
      {
        raw: {
          txnId: 'TX2',
          timestamp: partialMonthTs,
          amountMinor: 500000,
          currency: 'INR',
          direction: 'CREDIT',
          rail: 'UPI',
          remitter: { vpa: 'bundltechnologies@icici' },
          reference: 'REF2',
          narration: 'SWIGGY',
        },
        category: 'COUNTED',
        isGigIncome: true,
        classificationReason: 'Counted · Swiggy',
      },
    ];

    const agg = aggregateEvidenceCalendar(classifiedTxns, referenceCutoff);

    // Month index 35 (Sept 2026) should have the 800000 paise
    assert.strictEqual(agg.monthlyGigIncomeTotals[35], 800000);
    assert.strictEqual(agg.monthlyActivity[35], 1);

    // The partial month transaction (TX2) must NOT be added to any of the 36 completed months!
    const totalRecordedIncome = agg.monthlyGigIncomeTotals.reduce((a, b) => a + b, 0);
    assert.strictEqual(
      totalRecordedIncome,
      800000,
      'Partial current month income must not be counted in the 36 completed months'
    );
  });
});
