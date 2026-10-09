import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './toolchain.mjs';
import { createProvisionalPoseidon } from '../dist/circuits/src/provisional-poseidon.js';
import { calculator } from '../dist/circuits/test/runtime.js';

// A REAL local Groth16 primitive test. Single-party disposable ceremony; NOT a
// production setup, policy proof, attestation, consumer approval or deployable key.
const scratchRoot = resolve(root, '.scratch');
mkdirSync(scratchRoot, {recursive: true});
const scratch = mkdtempSync(resolve(scratchRoot, 'proof-'));
const path = name => resolve(scratch, name);
const cli = resolve(root, 'node_modules/snarkjs/build/cli.cjs');
function run(label, args, status = 0) {
  console.log(label);
  const result = spawnSync(process.execPath, [cli, ...args],
    {cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 2*1024*1024});
  if (result.error) throw result.error;
  assert.equal(result.status, status, `${label} failed: ${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
try {
  run('Local test-only phase 1 (power 10)', ['powersoftau','new','bn128','10',path('initial.ptau')]);
  run('Random local phase-1 contribution', ['powersoftau','contribute',path('initial.ptau'),path('contributed.ptau'),
    '--name=LOCAL_TEST_ONLY', `-e=${randomBytes(64).toString('hex')}`]);
  run('Prepare phase 2', ['powersoftau','prepare','phase2',path('contributed.ptau'),path('prepared.ptau')]);
  run('Groth16 setup for H5 only', ['groth16','setup',resolve(root,'build/h5.r1cs'),path('prepared.ptau'),path('initial.zkey')]);
  run('Random local phase-2 contribution', ['zkey','contribute',path('initial.zkey'),path('final.zkey'),
    '--name=LOCAL_TEST_ONLY', `-e=${randomBytes(64).toString('hex')}`]);
  run('Export local verification key', ['zkey','export','verificationkey',path('final.zkey'),path('verification-key.json')]);
  const hashes = await createProvisionalPoseidon();
  const values = [1100n,1n,2n,3n,4n];
  const wasm = await calculator('h5');
  writeFileSync(path('synthetic.wtns'), await wasm.calculateWTNSBin({inputs: values.map(String)}, true));
  run('Prove actual compiled H5 witness', ['groth16','prove',path('final.zkey'),path('synthetic.wtns'),path('proof.json'),path('public.json')]);
  const publicSignals = JSON.parse(readFileSync(path('public.json'),'utf8'));
  assert.deepEqual(publicSignals, [hashes.h5(values).toString()]);
  assert.match(run('Verify real proof', ['groth16','verify',path('verification-key.json'),path('public.json'),path('proof.json')]), /OK!/);
  writeFileSync(path('public.json'), JSON.stringify([(BigInt(publicSignals[0])+1n).toString()]));
  assert.match(run('Reject same proof with modified public hash',
    ['groth16','verify',path('verification-key.json'),path('public.json'),path('proof.json')], 1), /Invalid proof/);
  console.log('Groth16 H5 smoke passed: valid proof accepted; modified public output rejected. No application authorization claimed.');
} finally {
  assert.ok(scratch.startsWith(scratchRoot+sep));
  rmSync(scratch, {recursive: true, force: true});
}
