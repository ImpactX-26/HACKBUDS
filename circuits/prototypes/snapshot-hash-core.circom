pragma circom 2.2.3;
include "circomlib/circuits/poseidon.circom";

// Approved Fr profile gv-poseidon-hash-only-0.2.0; tags/order remain PROVISIONAL.
// Recursively group four children; zero padding at EVERY incomplete level.
template FourChildTree(n, tags, level) {
    signal input values[n];
    signal output root;
    var groups = (n + 3) \ 4;
    component hashes[groups];
    for (var i = 0; i < groups; i++) {
        hashes[i] = Poseidon(5);
        hashes[i].inputs[0] <== tags[level];
        for (var j = 0; j < 4; j++) {
            if (4*i+j < n) hashes[i].inputs[j+1] <== values[4*i+j];
            else hashes[i].inputs[j+1] <== 0;
        }
    }
    if (groups == 1) root <== hashes[0].out;
    else {
        component parent = FourChildTree(groups, tags, level+1);
        for (var i = 0; i < groups; i++) parent.values[i] <== hashes[i].out;
        root <== parent.root;
    }
}

template ProvisionalSnapshotHash() {
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
    // Diagnostic outputs only: not an approved application public-signal manifest.
    signal output incomeRoot;
    signal output weeklyRoot;
    signal output monthlyRoot;
    signal output evidenceCommitment;

    component income = FourChildTree(36, [1100,1101,1102], 0);
    component weeks = FourChildTree(156, [1200,1201,1202,1203], 0);
    component months = FourChildTree(36, [1300,1301,1302], 0);
    for (var i = 0; i < 36; i++) {
        income.values[i] <== monthlyGigIncomeTotals[i];
        months.values[i] <== monthlyActivity[i];
        monthlyActivity[i] * (monthlyActivity[i]-1) === 0;
    }
    for (var i = 0; i < 156; i++) {
        weeks.values[i] <== weeklyActivity[i];
        weeklyActivity[i] * (weeklyActivity[i]-1) === 0;
    }
    incomeRoot <== income.root;
    weeklyRoot <== weeks.root;
    monthlyRoot <== months.root;

    signal slots[10];
    slots[0] <== passportId;
    slots[1] <== holderBinding;
    slots[2] <== evidenceProviderId;
    slots[3] <== evidenceDataHash;
    slots[4] <== verifiedHistoryStartDate;
    slots[5] <== evidenceUpdatedAt;
    slots[6] <== sourceDirectoryVersion;
    slots[7] <== incomeRoot;
    slots[8] <== weeklyRoot;
    slots[9] <== monthlyRoot;
    component metadata = FourChildTree(10, [1400,1499], 0);
    for (var i = 0; i < 10; i++) metadata.values[i] <== slots[i];
    evidenceCommitment <== metadata.root;
    evidenceCommitment === expectedCommitment;
}
