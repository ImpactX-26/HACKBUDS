// Private witness lives only in this disposable child process; no filesystem IPC.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {groth16} from 'snarkjs';
const require=createRequire(import.meta.url);
process.once('message',async ({input,wasm,calculator,zkey,vk})=>{
  let binary;
  try {
    const calc=await require(calculator)(readFileSync(wasm));
    binary=await calc.calculateWTNSBin(input,true);
    const result=await groth16.prove(zkey,binary,undefined,{singleThread:true});
    if(!await groth16.verify(vk,result.publicSignals,result.proof)) throw Error('Invalid proof');
    process.send({ok:true,...result,metrics:{workerMaxRssBytes:process.resourceUsage().maxRSS*1024||null,
      workerRssBytes:process.memoryUsage().rss}},()=>process.exit(0));
  } catch {
    // Circom errors can contain private input values. Never forward them.
    process.send({ok:false},()=>process.exit(1));
  } finally {
    binary?.fill(0);
    input=null;
  }
});
