import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {root as contractsRoot} from './compile.mjs';
import {digest} from '../../circuits/service/engine.mjs';
const circuitsRoot=resolve(contractsRoot,'../circuits');
const transcriptHash='6247a3433948b35fbfae414fa5a9355bfb45f56efa7ab4929e669264a0258976741dfbe3288bfb49828e5df02c2e633df38d2245e30162ae7e3bcca5b8b49345';
async function cli(args) {
  await new Promise((ok,no)=>{
    const child=spawn(process.execPath,[resolve(circuitsRoot,'node_modules/snarkjs/build/cli.cjs'),...args],
      {cwd:circuitsRoot,windowsHide:true,stdio:'ignore'});
    child.on('error',no);child.on('exit',code=>code===0?ok():no(Error('Local setup command failed')));
  });
}
export async function prepareLocalSetup() {
  const parent=resolve(contractsRoot,'artifacts/local');mkdirSync(parent,{recursive:true});
  const directory=mkdtempSync(resolve(parent,'session-'));
  const cleanup=()=>{
    if(!directory.startsWith(parent+sep))throw Error('Unsafe cleanup path');
    rmSync(directory,{recursive:true,force:true});
  };
  try {
    // Local demo only: reuse a previously verified key, checking every artifact.
    const cache=process.env.GIGVAULT_LOCAL_SETUP_CACHE;
    if(cache) {
      const manifest=JSON.parse(readFileSync(resolve(cache,'manifest.json'),'utf8'));
      if(manifest.localOnly!==true || manifest.commitmentProfile!=='gv-poseidon-hash-only-0.2.0')throw Error('Unsupported local setup cache');
      const setup={directory,cleanup,r1cs:resolve(circuitsRoot,'build/eligibility-v02.r1cs'),
        wasm:resolve(circuitsRoot,'build/eligibility-v02_js/eligibility-v02.wasm'),
        calculator:resolve(circuitsRoot,'build/eligibility-v02_js/witness_calculator.js')};
      for(const [key,name] of Object.entries({zkey:'final.zkey',vk:'vk.json',verifier:'Groth16Verifier.sol'})) {
        const source=resolve(cache,name);
        if(digest(source)!==manifest.setupDigests[key])throw Error('Local setup cache digest mismatch: '+key);
        setup[key]=resolve(directory,name);copyFileSync(source,setup[key]);
      }
      setup.digests=Object.fromEntries(['r1cs','wasm','calculator','zkey','vk','verifier'].map(k=>[k,digest(setup[k])]));
      for(const key of Object.keys(setup.digests))if(setup.digests[key]!==manifest.setupDigests[key])throw Error('Local setup cache incompatible: '+key);
      setup.id=createHash('sha256').update(JSON.stringify(setup.digests)).digest('hex');
      if(setup.id!==manifest.setupId)throw Error('Local setup cache identity mismatch');
      return setup;
    }
    const ptau=process.env.GIGVAULT_TEST_PTAU??resolve(circuitsRoot,'.tools/powersOfTau28_hez_final_17.ptau');
    if(!existsSync(ptau)) {
      // Free public transcript; no paid services, credentials or worker data.
      console.log('Downloading free public power17 transcript (about 144 MB).');
      const response=await fetch('https://circom.info/powersOfTau28_hez_final_17.ptau');
      if(!response.ok)throw Error('Public transcript download failed');
      const bytes=Buffer.from(await response.arrayBuffer());
      if(createHash('blake2b512').update(bytes).digest('hex')!==transcriptHash)throw Error('Transcript hash mismatch');
      mkdirSync(resolve(ptau,'..'),{recursive:true});writeFileSync(ptau,bytes);
    }
    if(createHash('blake2b512').update(readFileSync(ptau)).digest('hex')!==transcriptHash)throw Error('Transcript hash mismatch');
    const path=name=>resolve(directory,name);
    const r1cs=resolve(circuitsRoot,'build/eligibility-v02.r1cs');
    console.log('Creating disposable LOCAL ONLY Groth16 phase2 key.');
    await cli(['groth16','setup',r1cs,ptau,path('initial.zkey')]);
    await cli(['zkey','contribute',path('initial.zkey'),path('final.zkey'),'--name=LOCAL_B4_ONLY',`-e=${randomBytes(64).toString('hex')}`]);
    rmSync(path('initial.zkey'));
    await cli(['zkey','export','verificationkey',path('final.zkey'),path('vk.json')]);
    await cli(['zkey','export','solidityverifier',path('final.zkey'),path('Groth16Verifier.sol')]);
    const setup={directory,cleanup,r1cs,wasm:resolve(circuitsRoot,'build/eligibility-v02_js/eligibility-v02.wasm'),
      calculator:resolve(circuitsRoot,'build/eligibility-v02_js/witness_calculator.js'),zkey:path('final.zkey'),vk:path('vk.json'),
      verifier:path('Groth16Verifier.sol')};
    setup.digests=Object.fromEntries(['r1cs','wasm','calculator','zkey','vk','verifier'].map(k=>[k,digest(setup[k])]));
    setup.id=createHash('sha256').update(JSON.stringify(setup.digests)).digest('hex');
    return setup;
  } catch(error) {cleanup();throw error;}
}
