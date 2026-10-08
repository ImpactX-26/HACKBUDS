// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Isolated lifecycle implementation of GV-050..055. Not deployed or crypto-integrated.
/// @dev Evidence values are opaque attester inputs. This contract cannot validate FIP,
/// identity proofs or a Poseidon preimage. Those validations must precede attestation.
/// ABI/storage widths are implementation details for review, not a shared crypto codec.
contract GigPassport is ERC721, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ATTESTER_ROLE = keccak256("ATTESTER_ROLE");

    enum Status { ACTIVE, REVOKED }
    struct Evidence {
        uint256 commitment;
        uint256 updatedAt;
        uint256 schemaVersion;
        bytes32 providerRef;
        uint256 sourceDirectoryVersion;
    }
    struct Passport {
        address holderWallet;
        bytes32 identityNullifierHash;
        uint256 evidenceCommitment;
        uint256 evidenceVersion;
        uint256 evidenceUpdatedAt;
        uint256 issuedAt;
        Status status;
        uint256 schemaVersion;
        bytes32 evidenceProvider;
        uint256 supersedes;
    }

    // IDs begin at 1; zero is the absent mapping sentinel (internal allocation choice).
    uint256 public nextPassportId = 1;
    mapping(uint256 => Passport) private _passports;
    mapping(bytes32 => uint256) public activePassportByIdentity;
    mapping(bytes32 => uint256) public latestPassportByIdentity;
    mapping(bytes32 => bool) public reissueAllowed;

    error InvalidInput();
    error RolesMustBeSeparate();
    error ExpectedIdMismatch(uint256 expected, uint256 actual);
    error ActivePassportExists(bytes32 identity);
    error ReissueNotAuthorized(bytes32 identity);
    error PassportNotActive(uint256 passportId);
    error ReissueRequiresRevokedPassport(bytes32 identity);
    error CommitmentUnchanged();
    error EvidenceTimestampRegressed();
    error NonTransferable();

    event PassportIssued(uint256 indexed passportId, bytes32 indexed identityNullifierHash,
        address indexed holderWallet, uint256 evidenceVersion, uint256 evidenceCommitment,
        uint256 evidenceUpdatedAt, uint256 sourceDirectoryVersion, uint256 schemaVersion,
        bytes32 evidenceProvider, uint256 supersedes);
    event EvidenceRefreshed(uint256 indexed passportId, uint256 evidenceVersion,
        uint256 evidenceCommitment, uint256 evidenceUpdatedAt, uint256 sourceDirectoryVersion,
        uint256 schemaVersion, bytes32 evidenceProvider);
    event PassportRevoked(uint256 indexed passportId, bytes32 indexed identityNullifierHash,
        string reason);
    event ReissueAuthorized(bytes32 indexed identityNullifierHash, uint256 indexed revokedPassportId);

    constructor(address admin, address attester) ERC721("GigVault Passport", "GVP") {
        if (admin == address(0) || attester == address(0)) revert InvalidInput();
        if (admin == attester) revert RolesMustBeSeparate();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(ATTESTER_ROLE, attester);
    }

    function getPassport(uint256 passportId) external view returns (Passport memory) {
        _requireOwned(passportId); // An absent token must never look ACTIVE (enum default).
        return _passports[passportId];
    }

    function mint(uint256 expectedId, address holder, bytes32 identity, Evidence calldata evidence)
        external onlyRole(ATTESTER_ROLE) returns (uint256 passportId)
    {
        if (expectedId != nextPassportId) revert ExpectedIdMismatch(expectedId, nextPassportId);
        if (holder == address(0) || identity == bytes32(0)) revert InvalidInput();
        _validateEvidence(evidence);
        if (activePassportByIdentity[identity] != 0) revert ActivePassportExists(identity);
        uint256 previous = latestPassportByIdentity[identity];
        if (previous != 0) {
            if (_passports[previous].status != Status.REVOKED || !reissueAllowed[identity]) {
                revert ReissueNotAuthorized(identity);
            }
            reissueAllowed[identity] = false;
        }
        passportId = nextPassportId++;
        _passports[passportId] = Passport(holder, identity, evidence.commitment, 1,
            evidence.updatedAt, block.timestamp, Status.ACTIVE, evidence.schemaVersion,
            evidence.providerRef, previous);
        activePassportByIdentity[identity] = passportId;
        latestPassportByIdentity[identity] = passportId;
        // No receiver callback: issuance cannot delegate or transfer the credential.
        _mint(holder, passportId);
        emit PassportIssued(passportId, identity, holder, 1, evidence.commitment,
            evidence.updatedAt, evidence.sourceDirectoryVersion, evidence.schemaVersion,
            evidence.providerRef, previous);
    }

    function refresh(uint256 passportId, Evidence calldata evidence) external onlyRole(ATTESTER_ROLE) {
        Passport storage passport = _activePassport(passportId);
        _validateEvidence(evidence);
        if (evidence.commitment == passport.evidenceCommitment) revert CommitmentUnchanged();
        if (evidence.updatedAt < passport.evidenceUpdatedAt) revert EvidenceTimestampRegressed();
        passport.evidenceCommitment = evidence.commitment;
        passport.evidenceVersion++;
        passport.evidenceUpdatedAt = evidence.updatedAt;
        passport.schemaVersion = evidence.schemaVersion;
        passport.evidenceProvider = evidence.providerRef;
        emit EvidenceRefreshed(passportId, passport.evidenceVersion, evidence.commitment,
            evidence.updatedAt, evidence.sourceDirectoryVersion, evidence.schemaVersion, evidence.providerRef);
    }

    function revoke(uint256 passportId, string calldata reason) external onlyRole(ADMIN_ROLE) {
        Passport storage passport = _activePassport(passportId);
        passport.status = Status.REVOKED;
        delete activePassportByIdentity[passport.identityNullifierHash];
        // Revocation never implicitly authorizes replacement.
        delete reissueAllowed[passport.identityNullifierHash];
        emit PassportRevoked(passportId, passport.identityNullifierHash, reason);
    }

    function authorizeReissue(bytes32 identity) external onlyRole(ADMIN_ROLE) {
        uint256 previous = latestPassportByIdentity[identity];
        if (previous == 0 || activePassportByIdentity[identity] != 0 ||
            _passports[previous].status != Status.REVOKED) revert ReissueRequiresRevokedPassport(identity);
        reissueAllowed[identity] = true;
        emit ReissueAuthorized(identity, previous);
    }

    function transferFrom(address, address, uint256) public pure override { revert NonTransferable(); }
    function approve(address, uint256) public pure override { revert NonTransferable(); }
    function setApprovalForAll(address, bool) public pure override { revert NonTransferable(); }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl)
        returns (bool) { return super.supportsInterface(interfaceId); }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert NonTransferable(); // Includes burn/self-transfer.
        return super._update(to, tokenId, auth);
    }

    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (account == address(0)) revert InvalidInput();
        if ((role == ATTESTER_ROLE && (hasRole(ADMIN_ROLE, account) || hasRole(DEFAULT_ADMIN_ROLE, account))) ||
            ((role == ADMIN_ROLE || role == DEFAULT_ADMIN_ROLE) && hasRole(ATTESTER_ROLE, account))) {
            revert RolesMustBeSeparate();
        }
        return super._grantRole(role, account);
    }

    function _activePassport(uint256 passportId) private view returns (Passport storage passport) {
        _requireOwned(passportId);
        passport = _passports[passportId];
        if (passport.status != Status.ACTIVE || activePassportByIdentity[passport.identityNullifierHash] != passportId) {
            revert PassportNotActive(passportId);
        }
    }

    function _validateEvidence(Evidence calldata evidence) private view {
        // Representation is intentionally opaque: no unapproved field modulus or tags.
        if (evidence.updatedAt > block.timestamp) revert InvalidInput();
    }
}
