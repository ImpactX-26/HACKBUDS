import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const pins = JSON.parse(readFileSync(resolve(root, 'toolchain.json'), 'utf8'));
export const asset = pins.assets[`${process.platform}-${process.arch}`];
if (!asset) throw new Error('No pinned native Circom asset for this platform/architecture. See README.');
export const compiler = resolve(root, '.tools', process.platform === 'win32' ? 'circom.exe' : 'circom');
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function verifyCompiler() {
  if (digest(readFileSync(compiler)) !== asset.sha256) throw new Error('Circom binary checksum mismatch');
  const result = spawnSync(compiler, ['--version'], {encoding: 'utf8'});
  if (result.status !== 0 || result.stdout.trim() !== `circom compiler ${pins.circomVersion}`) {
    throw new Error('Pinned Circom version check failed');
  }
  return result.stdout.trim();
}
