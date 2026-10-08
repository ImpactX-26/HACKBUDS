import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './toolchain.mjs';
import { createProvisionalPoseidon, PROFILE } from '../dist/circuits/src/provisional-poseidon.js';
import { fixtureVariants, SOURCE_COMMIT } from '../dist/circuits/test/backend-a-fixture.js';
import { calculator, decimal, encoded, outputs } from '../dist/circuits/test/runtime.js';

const hashes = await createProvisionalPoseidon();
const wasm = await calculator();
const vectors = {};
for (const [name,fixture] of Object.entries(fixtureVariants())) {
  const {metadataSlots,...expected} = hashes.commit(fixture);
  assert.deepEqual(outputs(await wasm.calculateWitness(encoded(fixture, expected.evidenceCommitment),true)), expected);
  vectors[name] = {...expected, metadataSlots};
}
writeFileSync(resolve(root,'fixtures/backend-a-gate1-vectors.json'), decimal({
  status:'PROVISIONAL BACKEND A PUBLIC SYNTHETIC SNAPSHOT; NOT PROTOCOL APPROVAL',
  profile:PROFILE, sourceCommit:SOURCE_COMMIT,
  toolchain:{circom:'2.2.3',circomlib:'2.0.5',circomlibjs:'0.1.7',snarkjs:'0.7.5'}, vectors
})+'\n');
console.log(`Recorded ${Object.keys(vectors).length} Backend A vectors after actual TypeScript/Circom parity.`);
