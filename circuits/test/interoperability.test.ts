import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { test } from 'node:test';
import { createProvisionalPoseidon, FIELD, PROFILE, TAGS, field, type HashInput } from '../src/provisional-poseidon.js';
import { baseline, fixtures } from './synthetic-fixtures.js';
import { calculator, decimal, encoded, outputs, root } from './runtime.js';

const hashes = await createProvisionalPoseidon();
const wasm = await calculator();
const golden = JSON.parse(readFileSync(resolve(root, 'fixtures/provisional-v02-vectors.json'), 'utf8'));
const expected = hashes.commit(baseline());
assert.equal(golden.profile, PROFILE);
assert.equal(golden.status, 'PROVISIONAL SYNTHETIC HASH-ONLY; NOT AUTHENTICATED FINANCIAL EVIDENCE');
assert.deepEqual(golden.baselineInput, JSON.parse(decimal(baseline())));
const changed = fixtures();
assert.deepEqual(Object.keys(golden.vectors), Object.keys(changed));

for (const [name, input] of Object.entries(changed)) {
  test(`exact TS/Circom/golden parity: ${name}`, async () => {
    const {metadataSlots, ...result} = hashes.commit(input);
    const witness = await wasm.calculateWitness(encoded(input, result.evidenceCommitment), true);
    assert.equal(witness[0], 1n);
    assert.deepEqual(outputs(witness), result);
    assert.deepEqual(JSON.parse(decimal({...result, metadataSlots})), golden.vectors[name]);
    if (name !== 'baseline') assert.notEqual(result.evidenceCommitment, expected.evidenceCommitment);
  });
}

test('primitive H5 matches compiled Poseidon(5), including field boundaries', async () => {
  const primitive = await calculator('h5');
  for (const values of [[1100n,1n,2n,3n,4n], [0n,0n,0n,0n,0n], [1499n,FIELD-1n,0n,1n,2n]]) {
    const witness = await primitive.calculateWitness({inputs: values.map(String)}, true);
    assert.equal(witness[1], hashes.h5(values));
  }
});

test('modified arrays/scalars/order cannot satisfy the original commitment constraint', async () => {
  for (const [name, input] of Object.entries(changed)) {
    if (name === 'baseline') continue;
    await assert.rejects(() => wasm.calculateWitness(encoded(input, expected.evidenceCommitment), true),
      /Assert Failed|constraint/i, name);
  }
});

test('incorrect metadata order, branch order and tags cannot satisfy circuit binding', async () => {
  const metadata = [...expected.metadataSlots];
  [metadata[2], metadata[3]] = [metadata[3]!, metadata[2]!];
  const branches = [...expected.metadataSlots];
  [branches[7], branches[8]] = [branches[8]!, branches[7]!];
  const wrongTags = [...expected.metadataSlots];
  wrongTags[7] = hashes.tree4(baseline().monthlyGigIncomeTotals, [1101n,1100n,1102n]);
  for (const slots of [metadata, branches, wrongTags]) {
    const wrong = hashes.tree4(slots, TAGS.metadata);
    assert.notEqual(wrong, expected.evidenceCommitment);
    await assert.rejects(() => wasm.calculateWitness(encoded(baseline(), wrong), true), /Assert Failed|constraint/i);
  }
});

// Fault injection reference, outside the adapter/circuit: nonzero padding at selected level.
function wrongPadding(values: HashInput['monthlyGigIncomeTotals'], tags: readonly bigint[], badLevel: number) {
  let layer = values.map(field);
  for (const [level, tag] of tags.entries()) {
    const next: bigint[] = [];
    for (let i = 0; i < layer.length; i += 4) {
      const pad = level === badLevel ? 1n : 0n;
      next.push(hashes.h5([tag, layer[i]!, layer[i+1] ?? pad, layer[i+2] ?? pad, layer[i+3] ?? pad]));
    }
    layer = next;
  }
  return layer[0]!;
}

test('incomplete intermediate/root groups require zeros in every missing child position', async () => {
  const fixture = baseline();
  for (const [values, tags, slot] of [
    [fixture.monthlyGigIncomeTotals, TAGS.income, 7], [fixture.weeklyActivity, TAGS.weekly, 8],
    [fixture.monthlyActivity, TAGS.monthly, 9]
  ] as const) {
    // First level is full for both 36 and 156; changing an unused padding value has no effect.
    assert.equal(wrongPadding(values, tags, 0), expected.metadataSlots[slot]);
    for (let level = 1; level < tags.length; level++) {
      const slots = [...expected.metadataSlots];
      slots[slot] = wrongPadding(values, tags, level);
      assert.notEqual(slots[slot], expected.metadataSlots[slot]);
      const wrong = hashes.tree4(slots, TAGS.metadata);
      await assert.rejects(() => wasm.calculateWitness(encoded(fixture, wrong), true), /Assert Failed|constraint/i);
    }
  }
  // Metadata 10->3->1 has two missing leaf children and one missing root child.
  for (const level of [0, 1]) {
    const wrong = wrongPadding(expected.metadataSlots, TAGS.metadata, level);
    assert.notEqual(wrong, expected.evidenceCommitment);
    await assert.rejects(() => wasm.calculateWitness(encoded(fixture, wrong), true), /Assert Failed|constraint/i);
  }
});

test('strict adapter rejects noncanonical integers, field overflow, malformed arrays and output input', () => {
  for (const scalar of [-1n, FIELD, FIELD+1n, 1, 1.5, Number.MAX_SAFE_INTEGER+1, '01', '-1', '0x10', '1e6', '', true]) {
    assert.throws(() => field(scalar));
  }
  for (const key of ['monthlyGigIncomeTotals', 'weeklyActivity', 'monthlyActivity'] as const) {
    for (const edit of ['short', 'long', 'hole', 'overflow']) {
      const fixture = baseline();
      if (edit === 'short') fixture[key].pop();
      if (edit === 'long') fixture[key].push(0n);
      if (edit === 'hole') delete fixture[key][1];
      if (edit === 'overflow') fixture[key][1] = FIELD;
      assert.throws(() => hashes.commit(fixture));
    }
  }
  assert.throws(() => hashes.commit({...baseline(), evidenceCommitment: 1n} as HashInput));
  assert.throws(() => hashes.h5([1n,2n,3n,4n]));
  assert.throws(() => hashes.tree4([1n,2n,3n,4n,5n], [1100n]));
  assert.throws(() => hashes.tree4([1n], [1100n,1101n]));
});

test('Circom independently rejects nonbinary activity even with its matching hash expectation', async () => {
  for (const key of ['weeklyActivity', 'monthlyActivity'] as const) {
    const fixture = baseline(); fixture[key][0] = 2n;
    assert.throws(() => hashes.commit(fixture), /Nonbinary/);
    // Compute raw field hashes deliberately bypassing adapter validation to test circuit constraints.
    const income = hashes.tree4(fixture.monthlyGigIncomeTotals, TAGS.income);
    const weekly = hashes.tree4(fixture.weeklyActivity, TAGS.weekly);
    const monthly = hashes.tree4(fixture.monthlyActivity, TAGS.monthly);
    const commitment = hashes.tree4([...expected.metadataSlots.slice(0,7),income,weekly,monthly], TAGS.metadata);
    const raw = encoded(baseline(), commitment);
    (raw[key] as string[])[0] = '2';
    await assert.rejects(() => wasm.calculateWitness(raw, true), /Assert Failed|constraint/i);
  }
});

test('snarkjs checks a real R1CS/witness and rejects a tampered witness', async () => {
  // Run the CLI in a subprocess to close all snarkjs worker resources on completion.
  const {spawnSync} = await import('node:child_process');
  const scratchRoot = resolve(root, '.scratch');
  mkdirSync(scratchRoot, {recursive: true});
  const scratch = mkdtempSync(resolve(scratchRoot, 'witness-'));
  try {
    const bin = Buffer.from(await wasm.calculateWTNSBin(encoded(baseline(), expected.evidenceCommitment), true));
    const file = resolve(scratch, 'synthetic.wtns');
    const cli = resolve(root, 'node_modules/snarkjs/build/cli.cjs');
    const check = () => spawnSync(process.execPath, [cli, 'wtns', 'check', resolve(root, 'build/snapshot-hash.r1cs'), file],
      {encoding: 'utf8', timeout: 120000});
    writeFileSync(file, bin);
    const valid = check();
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /WITNESS IS CORRECT/);
    // Locate WTNS section 2, then alter the first output, leaving the constant-1 signal intact.
    let offset = 12;
    let found = false;
    while (offset < bin.length) {
      const section = bin.readUInt32LE(offset), size = Number(bin.readBigUInt64LE(offset+4));
      offset += 12;
      if (section === 2) { bin[offset+32] = bin[offset+32]! ^ 1; found = true; break; }
      offset += size;
    }
    assert.ok(found); writeFileSync(file, bin);
    const invalid = check();
    assert.equal(invalid.status, 1, invalid.stderr);
    assert.match(invalid.stdout, /WITNESS IS NOT CORRECT/);
  } finally {
    assert.ok(scratch.startsWith(scratchRoot+sep));
    rmSync(scratch, {recursive: true, force: true});
  }
});
