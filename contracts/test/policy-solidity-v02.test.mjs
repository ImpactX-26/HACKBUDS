import assert from 'node:assert/strict';
import {test} from 'node:test';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,id,TypedDataEncoder} from 'ethers';
import {compile} from './eligibility-integration.mjs';
import {domainFor,policyTypes} from '../proposal/authorization-v02.mjs';
// ABI-only read test. A rejecting interface supplies constructor wiring; no
// mathematical verification success or consumer execution is simulated.
test('Solidity EIP712 policy/domain hashes match the actual ethers typed encoder',async()=>{
  const artifacts=compile('pragma solidity 0.8.30; contract RejectingMath { function verifyProof(uint[2] calldata,uint[2][2] calldata,uint[2] calldata,uint[29] calldata) external pure returns(bool){return false;} }');
  const chain=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:1337}}),provider=new BrowserProvider(chain);provider.pollingInterval=10;
  try {
    const admin=await provider.getSigner(0),attester=await provider.getSigner(1);
    const deploy=async(file,name,args)=>{const a=artifacts[file][name],c=await new ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;};
    const p=await deploy('src/GigPassport.sol','GigPassport',[await admin.getAddress(),await attester.getAddress()]);
    const m=await deploy('Groth16Verifier.sol','RejectingMath',[]);
    const gate=await deploy('src/proposal/EligibilityGateV02.sol','EligibilityGateV02',[await p.getAddress(),await m.getAddress(),await admin.getAddress()]);
    const domain=domainFor(1337,await gate.getAddress());
    assert.equal(await gate.domainHash(),TypedDataEncoder.hashDomain(domain));
    const policy={requestId:id('LOCAL_ABI_TEST'),verifierId:await admin.getAddress(),incomeEnabled:1,incomeWindowMonths:6,
      minAverageIncomePaise:2000000,activityEnabled:1,activityIsWeekly:0,activityWindow:12,minActivePeriods:9,
      historyEnabled:1,minHistoryMonths:12,maxEvidenceAgeDays:30,expiresAt:1791504000};
    assert.equal(await gate.policyHash(policy),TypedDataEncoder.hash(domain,policyTypes,policy));
  } finally {provider.destroy();await chain.disconnect();}
});
