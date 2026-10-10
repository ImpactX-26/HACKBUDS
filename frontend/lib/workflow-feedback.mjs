export function requestsForView(requests,view,selectedRequest){
 const scoped=requests.filter(r=>view==='welfare'?r.consumer==='welfare':view==='credit'?r.consumer==='loan':true);
 return selectedRequest&&['results','requests'].includes(view)?scoped.filter(r=>r.id===selectedRequest):scoped;
}
export function recoveryStage(state,now=Date.now()/1000){
 if(!state)return 'LOOKUP';
 if(state.replacementPassportId)return 'COMPLETE';
 if(state.passportStatus==='ACTIVE')return 'REVOKE';
 if(!state.reissueAllowed)return 'AUTHORIZE';
 return state.replacementWallet&&state.expiresAt>now?'REPLACEMENT_ONBOARDING':'APPROVE';
}
export function readableError(message){
 if(/user rejected|ACTION_REJECTED|4001/i.test(message))return 'The wallet request was declined. You can try again.';
 if(/insufficient funds/i.test(message))return 'This wallet needs enough network gas or test tokens to complete the transaction. See environment details.';
 if(/execution reverted|CALL_EXCEPTION|could not coalesce|missing revert data/i.test(message))return 'The transaction could not be completed in the current state. Refresh the status and follow the next available step.';
 return /^[A-Z_]+$/.test(message)?'This action is unavailable. Refresh the current status before trying again.':message;
}
