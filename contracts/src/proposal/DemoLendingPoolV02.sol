// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {EligibilityGateV02,IMathVerifierV02} from "./EligibilityGateV02.sol";
import {GigPassport} from "../GigPassport.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
contract DemoLendingPoolV02 is EligibilityGateV02,ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant PRINCIPAL=100*10**6;
    IERC20 public immutable asset;
    mapping(bytes32=>uint256) public principalByIdentity;
    mapping(bytes32=>bool) public consumedRequests;
    event Borrowed(bytes32 indexed identity,uint256 indexed passportId,bytes32 requestId);
    event Repaid(bytes32 indexed identity,uint256 indexed passportId);
    constructor(GigPassport p,IMathVerifierV02 m,address signer,IERC20 token) EligibilityGateV02(p,m,signer) {require(address(token)!=address(0));asset=token;}
    function _expectedPolicy(Policy calldata p) internal pure override returns(bool) {
        return p.incomeEnabled==1&&p.incomeWindowMonths==6&&p.minAverageIncomePaise==2000000&&
            p.historyEnabled==1&&p.minHistoryMonths==12&&p.activityEnabled==1&&p.activityIsWeekly==0&&
            p.activityWindow==12&&p.minActivePeriods==9&&p.maxEvidenceAgeDays==30;
    }
    function borrow(Package calldata x) external nonReentrant {
        GigPassport.Passport memory state=_verify(x);_requirePass(x);
        if(msg.sender!=state.holderWallet||principalByIdentity[state.identityNullifierHash]!=0||consumedRequests[x.policy.requestId]) revert InvalidAuthorization();
        principalByIdentity[state.identityNullifierHash]=PRINCIPAL;consumedRequests[x.policy.requestId]=true;
        asset.safeTransfer(state.holderWallet,PRINCIPAL);
        emit Borrowed(state.identityNullifierHash,x.passportId,x.policy.requestId);
    }
    function repay(uint256 passportId) external nonReentrant {
        GigPassport.Passport memory state=passport.getPassport(passportId);
        if(state.status!=GigPassport.Status.ACTIVE||msg.sender!=state.holderWallet||principalByIdentity[state.identityNullifierHash]!=PRINCIPAL) revert InvalidAuthorization();
        principalByIdentity[state.identityNullifierHash]=0;
        asset.safeTransferFrom(msg.sender,address(this),PRINCIPAL);
        emit Repaid(state.identityNullifierHash,passportId);
    }
}
