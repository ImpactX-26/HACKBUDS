import {fork} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
export const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
// One isolated job at a time bounds memory. No witness/proof JSON or WTNS files.
export function createProofEngine(setup,{timeoutMs=120000}={}) {
  let busy=false;
  return async input=>{
    if(busy) throw Error('Prover busy');
    busy=true;
    let child,timer;
    try {
      for(const name of ['wasm','calculator','zkey','vk'])
        if(digest(setup[name])!==setup.digests[name]) throw Error('Setup artifact changed');
      return await new Promise((resolve,reject)=>{
        child=fork(fileURLToPath(new URL('./proof-worker.mjs',import.meta.url)),[],{
          stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,serialization:'advanced'});
        let result;
        child.on('message',message=>{result=message;});
        child.on('error',()=>reject(Error('Prover execution failed')));
        child.on('exit',code=>code===0&&result?.ok?
          resolve({proof:result.proof,publicSignals:result.publicSignals,metrics:result.metrics}):reject(Error('Prover execution failed')));
        timer=setTimeout(()=>{child.kill();reject(Error('Prover timed out'));},timeoutMs);
        child.send({input,wasm:setup.wasm,calculator:setup.calculator,zkey:setup.zkey,
          vk:JSON.parse(readFileSync(setup.vk,'utf8'))},error=>{if(error)reject(Error('Prover IPC failed'));});
      });
    } finally {
      clearTimeout(timer);
      if(child&&child.exitCode===null&&child.signalCode===null) {
        const exited=once(child,'exit');child.kill();await exited.catch(()=>{});
      }
      busy=false;
    }
  };
}
