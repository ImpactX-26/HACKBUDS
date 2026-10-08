import {deployLocal} from './deploy.mjs';
const local=await deployLocal({port:8545});
console.log('LOCAL ONLY RPC: '+local.manifest.rpcUrl);
console.log('Ephemeral development accounts; manifest and proving key are removed on Ctrl+C.');
console.log('Callable prover adapter: circuits/service/trusted-prover.mjs (no HTTP proof endpoint).');
let closing=false;
const stop=async()=>{if(closing)return;closing=true;await local.close();process.exit(0);};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
