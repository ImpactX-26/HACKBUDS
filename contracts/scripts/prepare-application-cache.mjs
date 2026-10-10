import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareLocalSetup,cacheApplicationSetup} from '../local/setup.mjs';
const cache=resolve(dirname(fileURLToPath(import.meta.url)),'../artifacts/demo-setup-cache');
if(existsSync(resolve(cache,'manifest.json')))process.env.GIGVAULT_LOCAL_SETUP_CACHE=cache;
else delete process.env.GIGVAULT_LOCAL_SETUP_CACHE;
const setup=await prepareLocalSetup();
try{cacheApplicationSetup(setup);console.log('Verified public local application setup cache: '+setup.id);}
finally{setup.cleanup();}

