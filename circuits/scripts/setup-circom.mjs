import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { root, pins, asset, compiler, digest, verifyCompiler } from './toolchain.mjs';

if (!existsSync(compiler)) {
  const url = `https://github.com/iden3/circom/releases/download/v${pins.circomVersion}/${asset.name}`;
  const fromIndex = process.argv.indexOf('--from');
  if (fromIndex !== -1 && !process.argv[fromIndex+1]) throw new Error('--from requires a compiler path');
  let bytes;
  if (fromIndex !== -1) bytes = readFileSync(process.argv[fromIndex+1]);
  else {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Circom download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (digest(bytes) !== asset.sha256) throw new Error('Downloaded Circom checksum mismatch; file not installed');
  mkdirSync(dirname(compiler), {recursive: true});
  writeFileSync(compiler, bytes);
  if (process.platform !== 'win32') chmodSync(compiler, 0o755);
}
console.log(`${verifyCompiler()}; official release SHA256 ${asset.sha256}; local installation in ${root}/.tools`);
