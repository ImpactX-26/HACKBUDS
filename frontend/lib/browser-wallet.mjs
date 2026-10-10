export async function verifyBrowserWallet(ethereum,wallet){
 if(!ethereum?.request)throw Error('No browser wallet detected. Open the labeled development experience to test locally.');
 const chain=await ethereum.request({method:'eth_chainId'});
 if(BigInt(chain)!==1337n)throw Error('WALLET_CHAIN_CHANGED');
 const accounts=await ethereum.request({method:'eth_accounts'});
 if(!accounts?.[0]||wallet&&accounts[0].toLowerCase()!==wallet.toLowerCase())throw Error('WALLET_ACCOUNT_CHANGED');
 return accounts[0];
}
export async function connectBrowserWallet(ethereum,rpcUrl){
 if(!ethereum?.request)throw Error('No browser wallet detected. Open the labeled development experience to test locally.');
 const accounts=await ethereum.request({method:'eth_requestAccounts'});
 if(!accounts?.[0])throw Error('WALLET_ACCOUNT_CHANGED');
 try{await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x539'}]});}
 catch(e){if(e.code!==4902)throw e;
  await ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:'0x539',chainName:'GigVault local',nativeCurrency:{name:'Local ETH',symbol:'ETH',decimals:18},rpcUrls:[rpcUrl]}]});
  await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x539'}]});
 }
 return verifyBrowserWallet(ethereum,accounts[0]);
}
export function subscribeWalletChanges(ethereum,wallet,invalidate){
 if(!ethereum?.on)return ()=>{};
 const changed=accounts=>{if(!accounts?.[0]||accounts[0].toLowerCase()!==wallet.toLowerCase())invalidate();};
 ethereum.on('accountsChanged',changed);ethereum.on('chainChanged',invalidate);ethereum.on('disconnect',invalidate);
 return ()=>{ethereum.removeListener?.('accountsChanged',changed);ethereum.removeListener?.('chainChanged',invalidate);ethereum.removeListener?.('disconnect',invalidate);};
}
