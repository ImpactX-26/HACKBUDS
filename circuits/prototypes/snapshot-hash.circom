pragma circom 2.2.3;
include "snapshot-hash-core.circom";

// Hash-only compatibility circuit; no financial predicates or application authorization.
component main {public [expectedCommitment]} = ProvisionalSnapshotHash();
