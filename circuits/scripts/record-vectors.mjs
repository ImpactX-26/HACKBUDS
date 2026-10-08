import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createProvisionalPoseidon, PROFILE } from '../dist/src/provisional-poseidon.js';
import { baseline, fixtures } from '../dist/test/synthetic-fixtures.js';
import { calculator, decimal, encoded, outputs } from '../dist/test/runtime.js';

// Explicit command only: normal tests NEVER rewrite expected vectors.
const hashes = await createProvisionalPoseidon();
const wasm = await calculator();
const vectors = {};
for (const [name, fixture] of Object.entries(fixtures())) {
  const {metadataSlots, ...expected} = hashes.commit(fixture);
  const actual = outputs(await wasm.calculateWitness(encoded(fixture, expected.evidenceCommitment), true));
  assert.deepEqual(actual, expected, `${name}: actual TS/Circom outputs must agree before recording`);
  vectors[name] = {...expected, metadataSlots};
}
mkdirSync('fixtures', {recursive: true});
const record = {status: 'PROVISIONAL SYNTHETIC HASH-ONLY; NOT AUTHENTICATED FINANCIAL EVIDENCE',
  profile: PROFILE, toolchain: {circom: '2.2.3', circomlib: '2.0.5', circomlibjs: '0.1.7', snarkjs: '0.7.5'},
  baselineInput: baseline(), vectors};
writeFileSync(resolve('fixtures', 'provisional-vectors.json'), JSON.stringify(JSON.parse(decimal(record)), null, 2)+'\n');
console.log(`Recorded ${Object.keys(vectors).length} vectors only after exact TypeScript/compiled Circom parity.`);
