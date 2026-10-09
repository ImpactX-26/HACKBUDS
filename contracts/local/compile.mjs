import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import solc from 'solc';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function compile(verifierSource) {
  const paths=['src/GigPassport.sol',...['EligibilityGateV02','WelfareVaultV02','DemoLendingPoolV02','MockUSDCV02'].map(x=>'src/proposal/'+x+'.sol')];
  const sources=Object.fromEntries(paths.map(x=>[x,{content:readFileSync(resolve(root,x),'utf8')}]));
  sources['Groth16Verifier.sol']={content:verifierSource};
  const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{
    optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',
    outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:path=>{
      const file=[resolve(root,path),resolve(root,'node_modules',path)].find(existsSync);
      return file?{contents:readFileSync(file,'utf8')}:{error:'Missing '+path};
    }}));
  assert.deepEqual((output.errors??[]).filter(x=>x.severity==='error'),[]);
  return output.contracts;
}
