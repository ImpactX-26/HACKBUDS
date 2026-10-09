pragma circom 2.2.3;
include "circomlib/circuits/poseidon.circom";
// Diagnostic primitive only; any proof from this circuit proves a five-field hash.
component main = Poseidon(5);
