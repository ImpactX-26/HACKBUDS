import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import ts from 'typescript';
import { root } from './toolchain.mjs';

// Frozen PUBLIC review source, not Backend A checkout or production implementation.
// Transpile only: Backend A's reported full typecheck/build/tests are not claimed here.
const sourceRoot = resolve(root, 'review-inputs/backend-a');
const outputRoot = resolve(root, 'build/upstream');
const manifest = JSON.parse(readFileSync(resolve(sourceRoot,'manifest.json'),'utf8'));
assert.equal(manifest.commit, '8c5042bd37d6a74bb3c765f58eb6ac855caa1b6f');
for (const entry of manifest.files) {
  const input = resolve(sourceRoot, entry.localPath);
  assert.ok(input.startsWith(sourceRoot+sep));
  let text = entry.upstreamPath.endsWith('.ts') ? JSON.parse(readFileSync(input,'utf8')).lines.join('\n')
    : readFileSync(input,'utf8').replace(/\r\n/g,'\n');
  // apply_patch/git may add one terminal newline to files originally lacking it.
  if (!entry.upstreamPath.endsWith('.ts') && !entry.endsWithNewline) text = text.replace(/\n$/, '');
  const blob = createHash('sha1').update(`blob ${Buffer.byteLength(text,'utf8')}\0`).update(text).digest('hex');
  assert.equal(blob, entry.gitBlobSha, `Unmodified upstream blob: ${entry.upstreamPath}`);
  if (!entry.upstreamPath.endsWith('.ts')) continue;
  const output = resolve(outputRoot, entry.upstreamPath.replace(/\.ts$/,'.js'));
  assert.ok(output.startsWith(outputRoot+sep));
  mkdirSync(dirname(output), {recursive:true});
  writeFileSync(output, ts.transpileModule(text, {compilerOptions: {
    module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax:true
  }}).outputText);
}
writeFileSync(resolve(outputRoot,'package.json'), '{"type":"module"}\n');
console.log(`Verified ${manifest.files.length} exact Git blobs; transpiled frozen sources for focused review reproductions.`);
