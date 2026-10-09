import type {TypedDataDomain,TypedDataField} from 'ethers';
export declare const localLoginTypes:Record<string,TypedDataField[]>;
export declare function createLocalWalletAuth(config:{domain:TypedDataDomain;origin:string;now?:()=>number}):{
  challenge(wallet:string):{domain:TypedDataDomain;types:typeof localLoginTypes;value:{workerWallet:string;nonce:string;originHash:string;expiresAt:string}};
  login(nonce:string,signature:string):{token:string;workerWallet:string;expiresAt:number};
  authenticate(token:string|undefined):string;
  logout(token:string|undefined):void;
  close():void;
};
