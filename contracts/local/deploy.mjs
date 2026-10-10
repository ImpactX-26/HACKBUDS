import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ganache from 'ganache';
import {JsonRpcProvider,ContractFactory,Contract,Wallet,keccak256} from 'ethers';
import {compile} from './compile.mjs';
import {prepareLocalSetup} from './setup.mjs';
import {protocolVersion,eligibilityProfile} from '../../circuits/service/trusted-prover.mjs';
import {manifest as publicSignalOrder} from '../proposal/authorization-v02.mjs';
import {commitmentProfile,evidenceSchemaVersion} from '../integration/protocol.mjs';
export async function deployLocal({port=0,application=false,profile=null}={}) {
  const setup=await prepareLocalSetup();let server,provider;
  try {
    const artifacts=compile(readFileSync(setup.verifier,'utf8'));
    server=ganache.server({logging:{quiet:true},wallet:{totalAccounts:application?12:6,...(profile?{seed:profile.config.walletSeed}:{})},
      ...(profile?{database:{dbPath:resolve(profile.root,'chain')}}:{}),
      chain:{chainId:1337,hardfork:'shanghai',time:application?new Date():new Date('2026-10-09T00:00:00Z')}});
    // Hardcoded loopback. No public-network deployment option is provided.
    await server.listen(port||profile?.config.rpcPort||0,'127.0.0.1');
    if(profile&&!profile.config.rpcPort){profile.config.rpcPort=server.address().port;profile.write('config.json',profile.config);}
    const rpcUrl=`http://127.0.0.1:${server.address().port}`;
    provider=new JsonRpcProvider(rpcUrl,1337,{cacheTimeout:-1});provider.pollingInterval=10;
    const signers=await Promise.all([0,1,2,3,4,5].map(i=>provider.getSigner(i)));
    const addresses=await Promise.all(signers.map(s=>s.getAddress()));
    const accounts=server.provider.getInitialAccounts();
    const signing=address=>new Wallet(accounts[address.toLowerCase()].secretKey);
    const restored=profile?.read('deployment.json');
    if(profile?.read('accounts.json')&&!restored)throw Error('APPLICATION_DEPLOYMENT_MISSING');
    if(restored&&restored.setupId!==setup.id)throw Error('APPLICATION_SETUP_MISMATCH');
    const entries={};const transactions=[];
    const deploy=async(name,file,contract,args=[])=>{
      const a=artifacts[file][contract];
      let c;
      if(restored){const address=restored.contracts[name]?.address;if(!address||restored.contracts[name].creationHash!==keccak256('0x'+a.evm.bytecode.object)||keccak256(await provider.getCode(address))!==restored.contracts[name].runtimeHash)throw Error('APPLICATION_CHAIN_STATE_MISSING');c=new Contract(address,a.abi,signers[0]);}
      else{c=await new ContractFactory(a.abi,a.evm.bytecode.object,signers[0]).deploy(...args);
        await c.waitForDeployment();transactions.push({action:'deploy '+name,hash:c.deploymentTransaction().hash});}
      const abi=resolve(setup.directory,name+'.abi.json');writeFileSync(abi,JSON.stringify(a.abi,null,2)+'\n');
      entries[name]={address:await c.getAddress(),abi,contract,creationHash:keccak256('0x'+a.evm.bytecode.object),runtimeHash:keccak256(await provider.getCode(await c.getAddress()))};return c;
    };
    const passport=await deploy('passport','src/GigPassport.sol','GigPassport',[addresses[0],addresses[1]]);
    const math=await deploy('math','Groth16Verifier.sol','Groth16Verifier');
    const token=await deploy('token','src/proposal/MockUSDCV02.sol','MockUSDCV02');
    const args=[await passport.getAddress(),await math.getAddress(),addresses[4]];
    const gate=await deploy('gate','src/proposal/EligibilityGateV02.sol','EligibilityGateV02',args);
    const welfare=await deploy('welfare','src/proposal/WelfareVaultV02.sol','WelfareVaultV02',args);
    const loan=await deploy('loan','src/proposal/DemoLendingPoolV02.sol','DemoLendingPoolV02',[...args,await token.getAddress()]);
    if(!restored){const funding=await token.transfer(await loan.getAddress(),1000n*10n**6n);await funding.wait();
    transactions.push({action:'fund loan with 1000 MockUSDC',hash:funding.hash});}
    const manifest={protocolVersion,eligibilityProfile,commitmentProfile,evidenceSchemaVersion,
      localOnly:true,productionReady:false,chainId:1337,rpcUrl,setupId:setup.id,setupDigests:setup.digests,
      contracts:entries,roles:{admin:addresses[0],attester:addresses[1],verifier:addresses[4]},
      domain:{name:'GigVaultEligibility',version:'0.2-provisional',chainId:1337,verifyingContract:'per-consumer'},publicSignalOrder};
    profile?.write('deployment.json',{setupId:setup.id,contracts:entries});
    const manifestPath=resolve(setup.directory,'manifest.json');writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    console.log('Local contracts deployed. Manifest: '+manifestPath);
    let closed=false;
    return {setup,server,provider,signers,addresses,signing,passport,math,token,consumers:{gate,welfare,loan},
      manifest,manifestPath,transactions,async close(){if(closed)return;closed=true;provider.destroy();await server.close();setup.cleanup();}};
  } catch(error) {provider?.destroy();if(server?.address())await server.close();setup.cleanup();throw error;}
}
