// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {EligibilityGateV02,IMathVerifierV02} from "./EligibilityGateV02.sol";
import {GigPassport} from "../GigPassport.sol";
/// @notice LOCAL test-event benefit fallback, no POL transfer claimed.
contract WelfareVaultV02 is EligibilityGateV02 {
    mapping(bytes32=>bool) public claimedByIdentity;
    mapping(bytes32=>bool) public consumedRequests;
    event SupportClaimed(bytes32 indexed identity,uint256 indexed passportId,bytes32 requestId);
    constructor(GigPassport p,IMathVerifierV02 m,address signer) EligibilityGateV02(p,m,signer) {}
    function _expectedPolicy(Policy calldata p) internal pure override returns(bool) {
        return p.incomeEnabled==0&&p.incomeWindowMonths==0&&p.minAverageIncomePaise==0&&
            p.historyEnabled==1&&p.minHistoryMonths==6&&p.activityEnabled==1&&p.activityIsWeekly==0&&
            p.activityWindow==6&&p.minActivePeriods==4&&p.maxEvidenceAgeDays==90;
    }
    function claim(Package calldata x) external {
        GigPassport.Passport memory state=_verify(x);_requirePass(x);
        if(msg.sender!=state.holderWallet||claimedByIdentity[state.identityNullifierHash]||consumedRequests[x.policy.requestId]) revert InvalidAuthorization();
        claimedByIdentity[state.identityNullifierHash]=true;consumedRequests[x.policy.requestId]=true;
        emit SupportClaimed(state.identityNullifierHash,x.passportId,x.policy.requestId);
    }
}
