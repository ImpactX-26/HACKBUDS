// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {GigPassport} from "../GigPassport.sol";

interface IMathVerifierV02 {
    function verifyProof(uint256[2] calldata a,uint256[2][2] calldata b,uint256[2] calldata c,
        uint256[29] calldata signals) external view returns(bool);
}

/// @notice LOCAL provisional v0.2 adapter. No policy state in the math verifier.
/// EIP-712 encodings/limbs/history conventions need shared approval before rollout.
contract EligibilityGateV02 is EIP712 {
    struct Policy {
        bytes32 requestId; address verifierId;
        uint256 incomeEnabled; uint256 incomeWindowMonths; uint256 minAverageIncomePaise;
        uint256 activityEnabled; uint256 activityIsWeekly; uint256 activityWindow; uint256 minActivePeriods;
        uint256 historyEnabled; uint256 minHistoryMonths; uint256 maxEvidenceAgeDays; uint256 expiresAt;
    }
    struct Package {
        uint256 passportId; Policy policy; bytes verifierSignature; bytes workerSignature;
        uint256[2] a; uint256[2][2] b; uint256[2] c; uint256[29] signals;
    }
    bytes32 private constant POLICY_TYPEHASH=keccak256("VerificationPolicy(bytes32 requestId,address verifierId,uint256 incomeEnabled,uint256 incomeWindowMonths,uint256 minAverageIncomePaise,uint256 activityEnabled,uint256 activityIsWeekly,uint256 activityWindow,uint256 minActivePeriods,uint256 historyEnabled,uint256 minHistoryMonths,uint256 maxEvidenceAgeDays,uint256 expiresAt)");
    bytes32 private constant APPROVAL_TYPEHASH=keccak256("WorkerApproval(bytes32 requestId,uint256 passportId,uint256 evidenceVersion,uint256 evidenceCommitment,bytes32 policyHash,address verifierId,uint256 expiresAt,bytes32 domainHash)");
    GigPassport public immutable passport;
    IMathVerifierV02 public immutable mathVerifier;
    address public immutable intendedVerifier;
    error InvalidAuthorization(); error InvalidPolicy(); error InvalidProof(); error FailedCondition();
    constructor(GigPassport p,IMathVerifierV02 m,address signer) EIP712("GigVaultEligibility","0.2-provisional") {
        require(address(p)!=address(0)&&address(m)!=address(0)&&signer!=address(0));
        passport=p;mathVerifier=m;intendedVerifier=signer;
    }
    function domainHash() external view returns(bytes32) {return _domainSeparatorV4();}
    function policyHash(Policy calldata p) public view returns(bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(POLICY_TYPEHASH,p)));
    }
    function verify(Package calldata x) external view returns(uint256 incomePass,uint256 historyPass,uint256 activityPass) {
        _verify(x); return (x.signals[0],x.signals[1],x.signals[2]);
    }
    function _expectedPolicy(Policy calldata) internal pure virtual returns(bool) {return true;}
    function _verify(Package calldata x) internal view returns(GigPassport.Passport memory state) {
        Policy calldata p=x.policy;
        _validate(p);
        if(!_expectedPolicy(p)) revert InvalidPolicy();
        state=passport.getPassport(x.passportId);
        if(state.status!=GigPassport.Status.ACTIVE||state.evidenceUpdatedAt>block.timestamp||
            p.expiresAt<block.timestamp||(p.maxEvidenceAgeDays!=0&&block.timestamp-state.evidenceUpdatedAt>p.maxEvidenceAgeDays*1 days)) revert InvalidAuthorization();
        bytes32 ph=policyHash(p); bytes32 dh=_domainSeparatorV4();
        if(p.verifierId!=intendedVerifier||ECDSA.recover(ph,x.verifierSignature)!=intendedVerifier) revert InvalidAuthorization();
        bytes32 ah=_hashTypedDataV4(keccak256(abi.encode(APPROVAL_TYPEHASH,p.requestId,x.passportId,
            state.evidenceVersion,state.evidenceCommitment,ph,p.verifierId,p.expiresAt,dh)));
        if(ECDSA.recover(ah,x.workerSignature)!=state.holderWallet) revert InvalidAuthorization();
        uint256[29] calldata s=x.signals;
        if(s[4]!=state.evidenceCommitment||s[5]!=x.passportId||s[6]!=uint160(state.holderWallet)||
            s[7]!=state.evidenceUpdatedAt||s[8]!=state.evidenceVersion||s[9]!=uint160(p.verifierId)||
            s[10]!=block.chainid||s[11]!=uint160(address(this))||
            s[12]!=uint256(p.requestId)>>128||s[13]!=uint128(uint256(p.requestId))||
            s[14]!=uint256(ph)>>128||s[15]!=uint128(uint256(ph))||
            s[16]!=uint256(dh)>>128||s[17]!=uint128(uint256(dh))||s[18]!=p.expiresAt||s[19]!=p.maxEvidenceAgeDays||
            s[20]!=p.incomeEnabled||s[21]!=p.incomeWindowMonths||s[22]!=p.minAverageIncomePaise||
            s[23]!=p.activityEnabled||s[24]!=p.activityIsWeekly||s[25]!=p.activityWindow||s[26]!=p.minActivePeriods||
            s[27]!=p.historyEnabled||s[28]!=p.minHistoryMonths) revert InvalidAuthorization();
        if(!mathVerifier.verifyProof(x.a,x.b,x.c,s)) revert InvalidProof();
    }
    function _requirePass(Package calldata x) internal pure {
        if(x.signals[0]!=1||x.signals[1]!=1||x.signals[2]!=1) revert FailedCondition();
    }
    function _validate(Policy calldata p) private pure {
        if(p.requestId==0||p.verifierId==address(0)||p.incomeEnabled>1||p.activityEnabled>1||p.activityIsWeekly>1||p.historyEnabled>1||
            p.minAverageIncomePaise>type(uint64).max||p.expiresAt>type(uint40).max||p.maxEvidenceAgeDays>type(uint32).max) revert InvalidPolicy();
        if(p.incomeEnabled==1?(p.incomeWindowMonths==0||p.incomeWindowMonths>36):
            (p.incomeWindowMonths!=0||p.minAverageIncomePaise!=0)) revert InvalidPolicy();
        if(p.activityEnabled==1?(p.activityWindow==0||p.activityWindow>(p.activityIsWeekly==1?156:36)||p.minActivePeriods>p.activityWindow):
            (p.activityWindow!=0||p.minActivePeriods!=0||p.activityIsWeekly!=0)) revert InvalidPolicy();
        if(p.historyEnabled==1?(p.minHistoryMonths==0||p.minHistoryMonths>360):p.minHistoryMonths!=0) revert InvalidPolicy();
    }
}
