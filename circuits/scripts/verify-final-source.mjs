import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const manifest = JSON.parse(readFileSync('review-inputs/backend-a-e991-manifest.json', 'utf8'));
export const reviewRoot = resolve('.scratch/backend-a-e991');
for (const [path, expected] of Object.entries(manifest.blobs)) {
  const bytes = readFileSync(resolve(reviewRoot, path));
  const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`Published source mismatch: ${path}`);
}
if (process.argv[1]?.endsWith('verify-final-source.mjs')) {
  console.log(`Verified ${Object.keys(manifest.blobs).length} source/lock/test Git blobs at ${manifest.commit}`);
}
