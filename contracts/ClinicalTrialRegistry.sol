// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ClinicalTrialRegistry
 * @notice Implements Steps 4, 6, 10, 11 — RBAC, Protocol Enforcement,
 *         IPFS CID linking, Compliance Audit, and Consent verification.
 */
contract ClinicalTrialRegistry {

    // ─────────────────────────────────────────────────────────
    // Enums & Structs
    // ─────────────────────────────────────────────────────────

    enum NodeRole { NONE, PROTOCOL_VALIDATOR, CONSENT_VERIFIER, COMPLIANCE_AUDITOR }
    enum TrialPhase { NONE, I, II, III, IV }
    enum TrialStatus { PENDING, ACTIVE, COMPLETED, HALTED, REJECTED }

    struct NodeInfo {
        NodeRole   role;
        string     organization;
        uint256    reputationScore;   // 0–100 (scaled ×1e2, so 9700 = 97.00)
        bool       active;
        uint256    validatedCount;
        uint256    rejectedCount;
    }

    struct Trial {
        string      trialId;
        bytes32     dataHash;          // SHA-256 of raw record
        string      ipfsCid;           // IPFS Content ID
        TrialPhase  currentPhase;
        TrialStatus status;
        address     submittedBy;
        uint256     timestamp;
        string      complianceLabel;   // e.g. "HIPAA,GDPR,GCP"
        bool        consentVerified;
        uint256     dropoutRate;       // percentage ×100 (e.g. 500 = 5.00%)
        uint256     adverseEventCount;
        bool        mlApproved;        // passed ML pre-chain gate
    }

    struct Block_ {
        uint256   blockIndex;
        bytes32   previousHash;
        bytes32   merkleRoot;
        uint256   timestamp;
        address   validator;
        string[]  transactionIds;
    }

    // ─────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────

    address public owner;

    mapping(address => NodeInfo) public nodes;
    address[]                    public nodeList;

    mapping(string => Trial)    public trials;          // trialId → Trial
    string[]                    public trialIds;

    mapping(string => bool)     public trialExists;

    uint256 public constant MAX_DROPOUT_RATE  = 2000;  // 20.00%
    uint256 public constant MIN_REPUTATION    = 5000;  // 50.00

    uint256 public blockCount;
    mapping(uint256 => Block_) public chain;

    // ─────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────

    event NodeRegistered(address indexed node, NodeRole role, string organization);
    event NodeDeactivated(address indexed node);
    event ReputationUpdated(address indexed node, uint256 newScore);

    event TrialSubmitted(string trialId, address submittedBy, uint256 timestamp);
    event TrialApproved(string trialId, TrialPhase phase);
    event TrialRejected(string trialId, string reason);
    event TrialHalted(string trialId, address haltedBy, string reason);
    event PhaseAdvanced(string trialId, TrialPhase from, TrialPhase to);
    event ConsentVerified(string trialId, bytes32 consentHash);
    event IPFSLinked(string trialId, string ipfsCid);
    event BlockAppended(uint256 indexed blockIndex, bytes32 merkleRoot, address validator);
    event AuditLog(string trialId, address auditor, string action, uint256 timestamp);

    // ─────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyActiveNode() {
        require(nodes[msg.sender].active, "Node not active");
        _;
    }

    modifier onlyRole(NodeRole role) {
        require(nodes[msg.sender].role == role, "Insufficient role");
        require(nodes[msg.sender].active, "Node inactive");
        _;
    }

    modifier onlyValidator() {
        NodeRole r = nodes[msg.sender].role;
        require(
            r == NodeRole.PROTOCOL_VALIDATOR || r == NodeRole.CONSENT_VERIFIER,
            "Validators only"
        );
        require(nodes[msg.sender].active, "Node inactive");
        require(nodes[msg.sender].reputationScore >= MIN_REPUTATION, "Low reputation");
        _;
    }

    modifier trialMustExist(string memory trialId) {
        require(trialExists[trialId], "Trial not found");
        _;
    }

    // ─────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        // Genesis block
        chain[0] = Block_({
            blockIndex:     0,
            previousHash:   bytes32(0),
            merkleRoot:     bytes32(0),
            timestamp:      block.timestamp,
            validator:      msg.sender,
            transactionIds: new string[](0)
        });
        blockCount = 1;
    }

    // ─────────────────────────────────────────────────────────
    // Node Management (Step 4 — RBAC)
    // ─────────────────────────────────────────────────────────

    function registerNode(
        address nodeAddr,
        NodeRole role,
        string calldata organization
    ) external onlyOwner {
        require(role != NodeRole.NONE, "Invalid role");
        require(!nodes[nodeAddr].active, "Already registered");

        nodes[nodeAddr] = NodeInfo({
            role:           role,
            organization:   organization,
            reputationScore: 10000, // 100.00
            active:          true,
            validatedCount:  0,
            rejectedCount:   0
        });
        nodeList.push(nodeAddr);
        emit NodeRegistered(nodeAddr, role, organization);
    }

    function deactivateNode(address nodeAddr) external onlyOwner {
        nodes[nodeAddr].active = false;
        emit NodeDeactivated(nodeAddr);
    }

    function updateReputation(address nodeAddr, uint256 score) external onlyOwner {
        require(score <= 10000, "Score must be <= 10000");
        nodes[nodeAddr].reputationScore = score;
        emit ReputationUpdated(nodeAddr, score);
    }

    // ─────────────────────────────────────────────────────────
    // Trial Submission (Step 3 / 6)
    // ─────────────────────────────────────────────────────────

    function submitTrial(
        string calldata trialId,
        bytes32 dataHash,
        string  calldata ipfsCid,
        uint256 dropoutRate,
        bool    mlApproved,
        string  calldata complianceLabel
    ) external onlyActiveNode returns (bool) {
        require(!trialExists[trialId], "Trial already exists");
        require(mlApproved, "Rejected by ML pre-chain gate");
        require(dropoutRate <= MAX_DROPOUT_RATE, "Dropout rate exceeds threshold");

        trials[trialId] = Trial({
            trialId:          trialId,
            dataHash:         dataHash,
            ipfsCid:          ipfsCid,
            currentPhase:     TrialPhase.I,
            status:           TrialStatus.PENDING,
            submittedBy:      msg.sender,
            timestamp:        block.timestamp,
            complianceLabel:  complianceLabel,
            consentVerified:  false,
            dropoutRate:      dropoutRate,
            adverseEventCount: 0,
            mlApproved:       mlApproved
        });
        trialIds.push(trialId);
        trialExists[trialId] = true;

        nodes[msg.sender].validatedCount++;
        emit TrialSubmitted(trialId, msg.sender, block.timestamp);
        emit IPFSLinked(trialId, ipfsCid);
        return true;
    }

    // ─────────────────────────────────────────────────────────
    // Consent Verification (Step 4 / 11)
    // ─────────────────────────────────────────────────────────

    function verifyConsent(
        string calldata trialId,
        bytes32 consentHash
    ) external onlyRole(NodeRole.CONSENT_VERIFIER) trialMustExist(trialId) {
        Trial storage t = trials[trialId];
        require(t.status == TrialStatus.PENDING, "Trial not pending");
        // In production: ZKP verification would go here
        // Here we accept non-zero consent hash as valid proof
        require(consentHash != bytes32(0), "Invalid consent hash");
        t.consentVerified = true;
        emit ConsentVerified(trialId, consentHash);
    }

    // ─────────────────────────────────────────────────────────
    // Protocol Validation & Phase Advancement (Step 6)
    // ─────────────────────────────────────────────────────────

    function approveAndActivate(
        string calldata trialId
    ) external onlyRole(NodeRole.PROTOCOL_VALIDATOR) trialMustExist(trialId) {
        Trial storage t = trials[trialId];
        require(t.status == TrialStatus.PENDING, "Not pending");
        require(t.consentVerified, "Consent not verified");
        require(t.mlApproved, "ML gate not passed");

        t.status = TrialStatus.ACTIVE;
        emit TrialApproved(trialId, t.currentPhase);
    }

    function advancePhase(
        string calldata trialId
    ) external onlyRole(NodeRole.PROTOCOL_VALIDATOR) trialMustExist(trialId) {
        Trial storage t = trials[trialId];
        require(t.status == TrialStatus.ACTIVE, "Trial not active");

        TrialPhase from = t.currentPhase;
        if (from == TrialPhase.I)   { t.currentPhase = TrialPhase.II;  }
        else if (from == TrialPhase.II)  { t.currentPhase = TrialPhase.III; }
        else if (from == TrialPhase.III) { t.currentPhase = TrialPhase.IV;  }
        else if (from == TrialPhase.IV)  {
            t.status = TrialStatus.COMPLETED;
            return;
        }
        emit PhaseAdvanced(trialId, from, t.currentPhase);
    }

    function haltTrial(
        string calldata trialId,
        string calldata reason
    ) external onlyValidator trialMustExist(trialId) {
        Trial storage t = trials[trialId];
        require(t.status == TrialStatus.ACTIVE || t.status == TrialStatus.PENDING, "Cannot halt");
        t.status = TrialStatus.HALTED;
        nodes[msg.sender].rejectedCount++;
        emit TrialHalted(trialId, msg.sender, reason);
    }

    function rejectTrial(
        string calldata trialId,
        string calldata reason
    ) external onlyValidator trialMustExist(trialId) {
        Trial storage t = trials[trialId];
        require(t.status == TrialStatus.PENDING, "Not pending");
        t.status = TrialStatus.REJECTED;
        nodes[msg.sender].rejectedCount++;
        emit TrialRejected(trialId, reason);
    }

    // ─────────────────────────────────────────────────────────
    // Block Appending (Step 9)
    // ─────────────────────────────────────────────────────────

    function appendBlock(
        bytes32 merkleRoot,
        string[] calldata transactionIds
    ) external onlyValidator returns (uint256) {
        uint256 idx = blockCount;
        bytes32 prevHash = keccak256(abi.encodePacked(
            chain[idx-1].blockIndex,
            chain[idx-1].merkleRoot,
            chain[idx-1].timestamp
        ));

        chain[idx] = Block_({
            blockIndex:     idx,
            previousHash:   prevHash,
            merkleRoot:     merkleRoot,
            timestamp:      block.timestamp,
            validator:      msg.sender,
            transactionIds: transactionIds
        });
        blockCount++;
        emit BlockAppended(idx, merkleRoot, msg.sender);
        return idx;
    }

    // ─────────────────────────────────────────────────────────
    // Compliance Audit (Step 11)
    // ─────────────────────────────────────────────────────────

    function auditTrial(
        string calldata trialId,
        string calldata action
    ) external onlyRole(NodeRole.COMPLIANCE_AUDITOR) trialMustExist(trialId) {
        emit AuditLog(trialId, msg.sender, action, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────────────────

    function getTrial(string calldata trialId)
        external view trialMustExist(trialId)
        returns (Trial memory) {
        return trials[trialId];
    }

    function getBlock(uint256 idx) external view returns (Block_ memory) {
        require(idx < blockCount, "Block out of range");
        return chain[idx];
    }

    function getAllTrialIds() external view returns (string[] memory) {
        return trialIds;
    }

    function getNodeList() external view returns (address[] memory) {
        return nodeList;
    }

    function consensusWeight(address nodeAddr) external view returns (uint256) {
        NodeInfo memory n = nodes[nodeAddr];
        if (!n.active || n.reputationScore < MIN_REPUTATION) return 0;
        return n.reputationScore;
    }
}
