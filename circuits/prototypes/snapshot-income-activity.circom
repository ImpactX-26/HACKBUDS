pragma circom 2.2.3;
include "snapshot-hash-core.circom";
include "income-activity-core.circom";

// Local combined prototype. Uses existing PROVISIONAL commitment tags/order.
// Reveals two computed bits; no private branch roots, amounts or counts.
// No history predicate, request binding, signatures or live-chain authorization yet.
template SnapshotIncomeActivity() {
    signal input passportId;
    signal input holderBinding;
    signal input evidenceProviderId;
    signal input evidenceDataHash;
    signal input verifiedHistoryStartDate;
    signal input evidenceUpdatedAt;
    signal input sourceDirectoryVersion;
    signal input monthlyGigIncomeTotals[36];
    signal input weeklyActivity[156];
    signal input monthlyActivity[36];
    signal input expectedCommitment;
    signal input incomeEnabled;
    signal input incomeWindowMonths;
    signal input minAverageIncomePaise;
    signal input activityEnabled;
    signal input activityIsWeekly;
    signal input activityWindow;
    signal input minActivePeriods;
    signal output incomePass;
    signal output activityPass;
    component snapshot = ProvisionalSnapshotHash();
    snapshot.passportId <== passportId;
    snapshot.holderBinding <== holderBinding;
    snapshot.evidenceProviderId <== evidenceProviderId;
    snapshot.evidenceDataHash <== evidenceDataHash;
    snapshot.verifiedHistoryStartDate <== verifiedHistoryStartDate;
    snapshot.evidenceUpdatedAt <== evidenceUpdatedAt;
    snapshot.sourceDirectoryVersion <== sourceDirectoryVersion;
    snapshot.expectedCommitment <== expectedCommitment;
    component holderBits = Num2Bits(160);
    holderBits.in <== holderBinding;
    component predicates = IncomeActivity();
    for (var i=0; i<36; i++) {
        snapshot.monthlyGigIncomeTotals[i] <== monthlyGigIncomeTotals[i];
        snapshot.monthlyActivity[i] <== monthlyActivity[i];
        predicates.monthlyGigIncomeTotals[i] <== monthlyGigIncomeTotals[i];
        predicates.monthlyActivity[i] <== monthlyActivity[i];
    }
    for (var j=0; j<156; j++) {
        snapshot.weeklyActivity[j] <== weeklyActivity[j];
        predicates.weeklyActivity[j] <== weeklyActivity[j];
    }
    predicates.incomeEnabled <== incomeEnabled;
    predicates.incomeWindowMonths <== incomeWindowMonths;
    predicates.minAverageIncomePaise <== minAverageIncomePaise;
    predicates.activityEnabled <== activityEnabled;
    predicates.activityIsWeekly <== activityIsWeekly;
    predicates.activityWindow <== activityWindow;
    predicates.minActivePeriods <== minActivePeriods;
    incomePass <== predicates.incomePass;
    activityPass <== predicates.activityPass;
}
component main {public [expectedCommitment, incomeEnabled, incomeWindowMonths,
    minAverageIncomePaise, activityEnabled, activityIsWeekly, activityWindow,
    minActivePeriods]} = SnapshotIncomeActivity();
