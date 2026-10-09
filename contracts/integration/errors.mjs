// Stable LOCAL adapter codes. These are not shared protocol commitments.
export class BackendError extends Error {
  constructor(code,message){super(message);this.name='BackendError';this.code=code;}
  toJSON(){return {code:this.code,message:this.message};}
}
export const fail=(code,message)=>{throw new BackendError(code,message);};
export function safeError(error,contracts=[]) {
  if(error instanceof BackendError)return error;
  const data=error?.data??error?.info?.error?.data?.result;
  let name;
  for(const c of contracts)try {name=c.interface.parseError(data)?.name;if(name)break;}catch{}
  const known={InvalidPolicy:['INVALID_POLICY','This policy does not match the selected consumer.'],
    InvalidProof:['INVALID_PROOF','Cryptographic proof verification failed.'],
    FailedCondition:['CONDITION_FAILED','One or more approved conditions are not met.'],
    InvalidAuthorization:['AUTHORIZATION_INVALID','Authorization or consumer business-state checks failed.'],
    ERC721NonexistentToken:['PASSPORT_NOT_FOUND','The requested passport does not exist.'],
    ERC20InsufficientAllowance:['INSUFFICIENT_ALLOWANCE','Approve the exact test-token repayment first.'],
    ERC20InsufficientBalance:['INSUFFICIENT_BALANCE','The local test-token balance is insufficient.']};
  const value=known[name];return value?new BackendError(...value):new BackendError('BACKEND_UNAVAILABLE','The backend operation could not be completed.');
}
