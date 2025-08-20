// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title PropertyNFT - Enhanced Version
 * @dev NFT contract for tokenizing real-world real estate properties
 * @notice Addresses audit findings: gas optimization, multi-sig support, verification trails
 */
contract PropertyNFT is 
    ERC721, 
    ERC721URIStorage, 
    ERC721Enumerable, 
    Ownable, 
    ReentrancyGuard, 
    Pausable 
{
    using Counters for Counters.Counter;
    
    // Constants for gas optimization
    uint256 private constant MAX_TOKENS_PER_QUERY = 100;
    uint256 private constant MAX_BATCH_SIZE = 50;
    
    // Token ID counter
    Counters.Counter private _tokenIdCounter;
    
    // Enhanced property data structure
    struct PropertyData {
        string propertyId;
        uint256 propertyValue;
        string propertyAddress;
        uint256 squareFootage;
        string propertyType;
        uint256 yearBuilt;
        bool isTokenized;
        bool isVerified;
        address originalOwner;
        uint256 mintTimestamp;
        string legalDocumentsHash;
        string appraisalHash;
        // New fields for audit compliance
        uint256 lastAppraisalDate;
        address lastAppraiser;
        uint8 verificationCount;
        bytes32 documentHash; // Combined hash for integrity
    }
    
    // Verification trail structure
    struct VerificationRecord {
        address verifier;
        uint256 timestamp;
        string notes;
        bytes32 documentHash;
    }
    
    // Storage mappings
    mapping(uint256 => PropertyData) public properties;
    mapping(string => uint256) public propertyIdToTokenId;
    mapping(address => bool) public authorizedMinters;
    mapping(address => bool) public verifiedAppraisers;
    
    // Enhanced verification tracking
    mapping(uint256 => VerificationRecord[]) public verificationHistory;
    mapping(uint256 => uint256) public tokenToVerificationCount;
    
    // Multi-signature support
    mapping(bytes32 => uint256) public proposalVotes;
    mapping(bytes32 => mapping(address => bool)) public hasVoted;
    mapping(address => bool) public governanceMembers;
    uint256 public governanceThreshold = 2; // Require 2+ signatures
    uint256 public governanceMemberCount = 0;
    
    // Gas optimization: Pagination support
    mapping(address => uint256[]) private ownerTokens;
    mapping(uint256 => uint256) private tokenIndex;
    
    // Events
    event PropertyTokenized(
        uint256 indexed tokenId,
        string indexed propertyId,
        address indexed owner,
        uint256 propertyValue,
        string propertyAddress
    );
    
    event PropertyVerified(
        uint256 indexed tokenId, 
        address indexed verifier, 
        uint8 verificationCount
    );
    
    event PropertyValueUpdated(
        uint256 indexed tokenId, 
        uint256 oldValue, 
        uint256 newValue,
        address indexed appraiser
    );
    
    event GovernanceProposal(
        bytes32 indexed proposalId,
        address indexed proposer,
        string action,
        address target
    );
    
    event GovernanceVote(
        bytes32 indexed proposalId,
        address indexed voter,
        uint256 voteCount
    );
    
    // Modifiers
    modifier onlyAuthorizedMinter() {
        require(authorizedMinters[msg.sender] || msg.sender == owner(), "Not authorized to mint");
        _;
    }
    
    modifier onlyVerifiedAppraiser() {
        require(verifiedAppraisers[msg.sender] || msg.sender == owner(), "Not verified appraiser");
        _;
    }
    
    modifier onlyGovernance() {
        require(governanceMembers[msg.sender] || msg.sender == owner(), "Not governance member");
        _;
    }
    
    modifier tokenExists(uint256 tokenId) {
        require(_exists(tokenId), "Token does not exist");
        _;
    }
    
    modifier validPagination(uint256 offset, uint256 limit) {
        require(limit > 0 && limit <= MAX_TOKENS_PER_QUERY, "Invalid pagination limit");
        _;
    }
    
    constructor() ERC721("Real Estate Property NFT", "REPROP") {
        authorizedMinters[msg.sender] = true;
        verifiedAppraisers[msg.sender] = true;
        governanceMembers[msg.sender] = true;
        governanceMemberCount = 1;
    }
    
    /**
     * @dev Enhanced mint function with gas optimization
     */
    function mintProperty(
        address to,
        string memory propertyId,
        uint256 propertyValue,
        string memory propertyAddress,
        uint256 squareFootage,
        string memory propertyType,
        uint256 yearBuilt,
        string memory tokenURIString,
        string memory legalDocumentsHash,
        string memory appraisalHash
    ) external onlyAuthorizedMinter nonReentrant whenNotPaused returns (uint256) {
        // Input validation (gas-optimized)
        require(to != address(0), "Cannot mint to zero address");
        require(bytes(propertyId).length > 0, "Property ID required");
        require(propertyValue > 0, "Property value must be greater than 0");
        require(propertyIdToTokenId[propertyId] == 0, "Property already tokenized");
        
        // Increment counter and get new token ID
        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();
        
        // Create document hash for integrity
        bytes32 documentHash = keccak256(
            abi.encodePacked(legalDocumentsHash, appraisalHash, block.timestamp)
        );
        
        // Mint the NFT
        _mint(to, tokenId);
        _setTokenURI(tokenId, tokenURIString);
        
        // Store property data (single storage write optimization)
        properties[tokenId] = PropertyData({
            propertyId: propertyId,
            propertyValue: propertyValue,
            propertyAddress: propertyAddress,
            squareFootage: squareFootage,
            propertyType: propertyType,
            yearBuilt: yearBuilt,
            isTokenized: true,
            isVerified: false,
            originalOwner: to,
            mintTimestamp: block.timestamp,
            legalDocumentsHash: legalDocumentsHash,
            appraisalHash: appraisalHash,
            lastAppraisalDate: block.timestamp,
            lastAppraiser: msg.sender,
            verificationCount: 0,
            documentHash: documentHash
        });
        
        // Update mappings
        propertyIdToTokenId[propertyId] = tokenId;
        
        emit PropertyTokenized(tokenId, propertyId, to, propertyValue, propertyAddress);
        
        return tokenId;
    }
    
    /**
     * @dev Enhanced verification with audit trail
     */
    function verifyProperty(
        uint256 tokenId, 
        string memory notes
    ) public onlyAuthorizedMinter tokenExists(tokenId) {
        PropertyData storage property = properties[tokenId];
        property.isVerified = true;
        property.verificationCount++;
        
        // Add to verification history
        verificationHistory[tokenId].push(VerificationRecord({
            verifier: msg.sender,
            timestamp: block.timestamp,
            notes: notes,
            documentHash: property.documentHash
        }));
        
        tokenToVerificationCount[tokenId] = property.verificationCount;
        
        emit PropertyVerified(tokenId, msg.sender, property.verificationCount);
    }
    
    /**
     * @dev Gas-optimized token enumeration with pagination
     */
    function getTokensByOwner(
        address owner, 
        uint256 offset, 
        uint256 limit
    ) external view validPagination(offset, limit) returns (
        uint256[] memory tokens,
        uint256 totalCount,
        bool hasMore
    ) {
        uint256 balance = balanceOf(owner);
        totalCount = balance;
        
        if (balance == 0 || offset >= balance) {
            return (new uint256[](0), totalCount, false);
        }
        
        uint256 end = offset + limit;
        if (end > balance) {
            end = balance;
        }
        
        uint256 resultLength = end - offset;
        tokens = new uint256[](resultLength);
        
        for (uint256 i = 0; i < resultLength; i++) {
            tokens[i] = tokenOfOwnerByIndex(owner, offset + i);
        }
        
        hasMore = end < balance;
    }
    
    /**
     * @dev Batch verification for gas efficiency
     */
    function batchVerifyProperties(
        uint256[] memory tokenIds,
        string[] memory notes
    ) external onlyAuthorizedMinter {
        require(tokenIds.length == notes.length, "Arrays length mismatch");
        require(tokenIds.length <= MAX_BATCH_SIZE, "Batch size too large");
        
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (_exists(tokenIds[i]) && !properties[tokenIds[i]].isVerified) {
                verifyProperty(tokenIds[i], notes[i]);
            }
        }
    }
    
    /**
     * @dev Multi-signature governance proposal
     */
    function proposeGovernanceAction(
        string memory action,
        address target
    ) external onlyGovernance returns (bytes32) {
        bytes32 proposalId = keccak256(
            abi.encodePacked(action, target, block.timestamp, msg.sender)
        );
        
        proposalVotes[proposalId] = 1;
        hasVoted[proposalId][msg.sender] = true;
        
        emit GovernanceProposal(proposalId, msg.sender, action, target);
        
        return proposalId;
    }
    
    /**
     * @dev Vote on governance proposal
     */
    function voteOnProposal(bytes32 proposalId) external onlyGovernance {
        require(!hasVoted[proposalId][msg.sender], "Already voted");
        
        proposalVotes[proposalId]++;
        hasVoted[proposalId][msg.sender] = true;
        
        emit GovernanceVote(proposalId, msg.sender, proposalVotes[proposalId]);
    }
    
    /**
     * @dev Execute governance action if threshold met
     */
    function executeGovernanceAction(
        bytes32 proposalId,
        string memory action,
        address target
    ) external onlyGovernance {
        require(proposalVotes[proposalId] >= governanceThreshold, "Insufficient votes");
        
        if (keccak256(bytes(action)) == keccak256(bytes("authorizeMinter"))) {
            authorizedMinters[target] = true;
        } else if (keccak256(bytes(action)) == keccak256(bytes("revokeMinter"))) {
            authorizedMinters[target] = false;
        } else if (keccak256(bytes(action)) == keccak256(bytes("verifyAppraiser"))) {
            verifiedAppraisers[target] = true;
        }
        
        // Clear proposal
        delete proposalVotes[proposalId];
    }
    
    /**
     * @dev Enhanced property value update with appraiser tracking
     */
    function updatePropertyValue(
        uint256 tokenId, 
        uint256 newValue,
        string memory appraisalHash
    ) external onlyVerifiedAppraiser tokenExists(tokenId) {
        require(newValue > 0, "Value must be greater than 0");
        
        PropertyData storage property = properties[tokenId];
        uint256 oldValue = property.propertyValue;
        
        property.propertyValue = newValue;
        property.lastAppraisalDate = block.timestamp;
        property.lastAppraiser = msg.sender;
        property.appraisalHash = appraisalHash;
        
        emit PropertyValueUpdated(tokenId, oldValue, newValue, msg.sender);
    }
    
    /**
     * @dev Get verification history for a property
     */
    function getVerificationHistory(uint256 tokenId) 
        external 
        view 
        tokenExists(tokenId) 
        returns (VerificationRecord[] memory) 
    {
        return verificationHistory[tokenId];
    }
    
    /**
     * @dev Enhanced property lending readiness check
     */
    function isPropertyLendingReady(uint256 tokenId) 
        external 
        view 
        tokenExists(tokenId) 
        returns (bool ready, string memory reason) 
    {
        PropertyData memory prop = properties[tokenId];
        
        if (!prop.isTokenized) {
            return (false, "Property not tokenized");
        }
        
        if (!prop.isVerified) {
            return (false, "Property not verified");
        }
        
        if (prop.verificationCount < 1) {
            return (false, "Insufficient verifications");
        }
        
        // Check if appraisal is recent (within 1 year)
        if (block.timestamp - prop.lastAppraisalDate > 365 days) {
            return (false, "Appraisal too old");
        }
        
        return (true, "Ready for lending");
    }
    
    /**
     * @dev Add governance member
     */
    function addGovernanceMember(address member) external onlyOwner {
        require(!governanceMembers[member], "Already a member");
        governanceMembers[member] = true;
        governanceMemberCount++;
    }
    
    /**
     * @dev Remove governance member
     */
    function removeGovernanceMember(address member) external onlyOwner {
        require(governanceMembers[member], "Not a member");
        require(governanceMemberCount > 1, "Cannot remove last member");
        governanceMembers[member] = false;
        governanceMemberCount--;
    }
    
    /**
     * @dev Update governance threshold
     */
    function updateGovernanceThreshold(uint256 newThreshold) external onlyOwner {
        require(newThreshold > 0 && newThreshold <= governanceMemberCount, "Invalid threshold");
        governanceThreshold = newThreshold;
    }
    
    /**
     * @dev Add function to verify appraiser (needed for deployment script)
     */
    function verifyAppraiser(address appraiser) external onlyOwner {
        verifiedAppraisers[appraiser] = true;
    }
    
    /**
     * @dev Remove appraiser verification
     */
    function removeAppraiser(address appraiser) external onlyOwner {
        verifiedAppraisers[appraiser] = false;
    }
    
    // Required overrides for OpenZeppelin v4.9.6
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Enumerable) whenNotPaused {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }
    
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
        
        string memory propertyId = properties[tokenId].propertyId;
        delete properties[tokenId];
        delete propertyIdToTokenId[propertyId];
        delete verificationHistory[tokenId];
        delete tokenToVerificationCount[tokenId];
    }
    
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}