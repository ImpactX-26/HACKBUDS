import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {root, compiler, verifyCompiler} from './toolchain.mjs';

console.log(`${verifyCompiler()}; independent Backend B income/activity prototype; no shared wire freeze`);
mkdirSync(resolve(root,'build'),{recursive:true});
writeFileSync(resolve(root,'build/package.json'),'{"type":"commonjs"}\n');
for (const name of ['income-activity','snapshot-income-activity','history','eligibility-v02']) {
  const result=spawnSync(compiler,[resolve(root,'prototypes',name+'.circom'),
    '--r1cs','--wasm','--sym','--O1','--prime','bn128','-l',resolve(root,'node_modules'),
    '-o',resolve(root,'build')],{cwd:root,stdio:'inherit'});
  if(result.error) throw result.error;
  if(result.status!==0) process.exit(result.status??1);
}
