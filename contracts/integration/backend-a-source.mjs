import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,symlinkSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from '../../circuits/node_modules/typescript/lib/typescript.js';

export const backendACommit='b43b17084aea375a0c4bc59c53349d9f6a170396';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const root=resolve(repo,'contracts/artifacts/backend-a-b6',backendACommit);
function git(args){const result=spawnSync('git',args,{cwd:repo,windowsHide:true,maxBuffer:8*1024*1024});
  if(result.status!==0)throw Error('Pinned Backend A source unavailable; run npm run integration:a:prepare.');return result.stdout;}
/** Fetches PUBLIC Git objects only. No A checkout, branch modification or vendored pipeline. */
export function prepareBackendASource({fetch=false}={}) {
  if(fetch)git(['fetch','--no-tags','https://github.com/Manas150706/HACKBUDS.git',backendACommit]);
  const listing=git(['ls-tree','-r',backendACommit,'backend/src/fip','backend/src/evidence','backend/src/identity','shared/proposal']).toString();
  const files=[];
  for(const line of listing.trim().split('\n')){
    const match=/^100644 blob ([0-9a-f]{40})\t(.+\.ts)$/.exec(line);if(!match)continue;
    const [,blob,path]=match;
    if(path.includes('/identity/')&&!/^backend\/src\/identity\/(mock-idp|wallet-auth|types|aadhaar\/(types|real-verifier|mock-verifier)|onboarding\/attestation-adapter)\.ts$/.test(path))continue;
    const source=git(['cat-file','blob',blob]);
    const actual=createHash('sha1').update(`blob ${source.length}\0`).update(source).digest('hex');
    if(actual!==blob)throw Error('Backend A Git blob integrity failed.');
    const output=resolve(root,path.replace(/\.ts$/,'.js'));mkdirSync(dirname(output),{recursive:true});
    const result=ts.transpileModule(source.toString('utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,
      target:ts.ScriptTarget.ES2022,verbatimModuleSyntax:false},reportDiagnostics:true});
    if(result.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('Backend A transpilation failed.');
    writeFileSync(output,result.outputText);files.push({path,gitBlob:blob});
  }
  mkdirSync(resolve(root,'node_modules'),{recursive:true});
  // Dependency resolution only; upstream source and financial/crypto logic are unchanged.
  for(const [name,target]of [['ethers',resolve(repo,'contracts/node_modules/ethers')],['circomlibjs',resolve(repo,'circuits/node_modules/circomlibjs')],['snarkjs',resolve(repo,'circuits/node_modules/snarkjs')]]){
    const link=resolve(root,'node_modules',name);if(!existsSync(link))symlinkSync(target,link,'junction');
  }
  writeFileSync(resolve(root,'package.json'),'{"type":"module"}\n');
  const manifest={repository:'Manas150706/HACKBUDS',commit:backendACommit,files,
    mode:'verified Git blobs; TypeScript transpile only; not an upstream full build/test claim'};
  writeFileSync(resolve(root,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {manifest,importModule:path=>import(pathToFileURL(resolve(root,path+'.js')).href)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {manifest}=prepareBackendASource({fetch:true});console.log(`Prepared ${manifest.files.length} exact Backend A source blobs at ${backendACommit}.`);
}
