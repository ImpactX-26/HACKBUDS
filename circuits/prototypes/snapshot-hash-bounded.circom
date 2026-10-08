pragma circom 2.2.3;
include "snapshot-hash-core.circom";
include "circomlib/circuits/bitify.circom";

// PROVISIONAL uint64 amount / uint160 holder experiment, NOT approved protocol bounds.
template BoundedSnapshotHash() {
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
    signal output incomeRoot;
    signal output weeklyRoot;
    signal output monthlyRoot;
    signal output evidenceCommitment;
    component snapshot = ProvisionalSnapshotHash();
    snapshot.passportId <== passportId;
    snapshot.holderBinding <== holderBinding;
    snapshot.evidenceProviderId <== evidenceProviderId;
    snapshot.evidenceDataHash <== evidenceDataHash;
    snapshot.verifiedHistoryStartDate <== verifiedHistoryStartDate;
    snapshot.evidenceUpdatedAt <== evidenceUpdatedAt;
    snapshot.sourceDirectoryVersion <== sourceDirectoryVersion;
    snapshot.expectedCommitment <== expectedCommitment;
    component amounts[36];
    for (var i = 0; i < 36; i++) {
        amounts[i] = Num2Bits(64);
        amounts[i].in <== monthlyGigIncomeTotals[i];
        snapshot.monthlyGigIncomeTotals[i] <== monthlyGigIncomeTotals[i];
        snapshot.monthlyActivity[i] <== monthlyActivity[i];
    }
    for (var i = 0; i < 156; i++) snapshot.weeklyActivity[i] <== weeklyActivity[i];
    component holder = Num2Bits(160);
    holder.in <== holderBinding;
    incomeRoot <== snapshot.incomeRoot;
    weeklyRoot <== snapshot.weeklyRoot;
    monthlyRoot <== snapshot.monthlyRoot;
    evidenceCommitment <== snapshot.evidenceCommitment;
}
component main {public [expectedCommitment]} = BoundedSnapshotHash();
