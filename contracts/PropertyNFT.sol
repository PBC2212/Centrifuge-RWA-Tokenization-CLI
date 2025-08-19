// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title PropertyNFT
 * @dev NFT contract for tokenizing real-world real estate properties
 * @notice This contract creates NFTs that represent legal ownership of real estate
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
    
    // Token ID counter
    Counters.Counter private _tokenIdCounter;
    
    // Property data structure
    struct PropertyData {
        string propertyId;          // Unique property identifier
        uint256 propertyValue;      // Property value in USD (with 18 decimals)
        string propertyAddress;     // Physical address
        uint256 squareFootage;      // Size in square feet
        string propertyType;        // residential, commercial, industrial, etc.
        uint256 yearBuilt;          // Year property was built
        bool isTokenized;           // Whether property is actively tokenized
        bool isVerified;            // Whether property ownership is verified
        address originalOwner;      // Original property owner
        uint256 mintTimestamp;      // When NFT was minted
        string legalDocumentsHash;  // IPFS hash of legal documents
        string appraisalHash;       // IPFS hash of appraisal report
    }
    
    // Mapping from token ID to property data
    mapping(uint256 => PropertyData) public properties;
    
    // Mapping from property ID to token ID (prevent duplicates)
    mapping(string => uint256) public propertyIdToTokenId;
    
    // Mapping of authorized minters (property verification services)
    mapping(address => bool) public authorizedMinters;
    
    // Mapping of verified appraisers
    mapping(address => bool) public verifiedAppraisers;
    
    // Events
    event PropertyTokenized(
        uint256 indexed tokenId,
        string indexed propertyId,
        address indexed owner,
        uint256 propertyValue,
        string propertyAddress
    );
    
    event PropertyVerified(uint256 indexed tokenId, address indexed verifier);
    event PropertyValueUpdated(uint256 indexed tokenId, uint256 oldValue, uint256 newValue);
    event MinterAuthorized(address indexed minter);
    event MinterRevoked(address indexed minter);
    event AppraiserVerified(address indexed appraiser);
    
    // Modifiers
    modifier onlyAuthorizedMinter() {
        require(authorizedMinters[msg.sender] || msg.sender == owner(), "Not authorized to mint");
        _;
    }
    
    modifier onlyVerifiedAppraiser() {
        require(verifiedAppraisers[msg.sender] || msg.sender == owner(), "Not verified appraiser");
        _;
    }
    
    modifier tokenExists(uint256 tokenId) {
        require(_exists(tokenId), "Token does not exist");
        _;
    }
    
    constructor() ERC721("Real Estate Property NFT", "REPROP") {
        // Contract deployer is initial authorized minter
        authorizedMinters[msg.sender] = true;
        verifiedAppraisers[msg.sender] = true;
    }
    
    /**
     * @dev Mint a new property NFT
     * @param to Address to mint the NFT to (property owner)
     * @param propertyId Unique identifier for the property
     * @param propertyValue Value of the property in USD (18 decimals)
     * @param propertyAddress Physical address of the property
     * @param squareFootage Size of property in square feet
     * @param propertyType Type of property (residential, commercial, etc.)
     * @param yearBuilt Year the property was built
     * @param tokenURI IPFS URI containing property metadata
     * @param legalDocumentsHash IPFS hash of legal documents
     * @param appraisalHash IPFS hash of appraisal report
     */
    function mintProperty(
        address to,
        string memory propertyId,
        uint256 propertyValue,
        string memory propertyAddress,
        uint256 squareFootage,
        string memory propertyType,
        uint256 yearBuilt,
        string memory tokenURI,
        string memory legalDocumentsHash,
        string memory appraisalHash
    ) external onlyAuthorizedMinter nonReentrant whenNotPaused returns (uint256) {
        require(to != address(0), "Cannot mint to zero address");
        require(bytes(propertyId).length > 0, "Property ID required");
        require(propertyValue > 0, "Property value must be greater than 0");
        require(propertyIdToTokenId[propertyId] == 0, "Property already tokenized");
        require(bytes(propertyAddress).length > 0, "Property address required");
        require(squareFootage > 0, "Square footage must be greater than 0");
        require(yearBuilt > 1800 && yearBuilt <= block.timestamp / 365 days + 1970, "Invalid year built");
        
        // Increment counter and get new token ID
        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();
        
        // Mint the NFT
        _mint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        
        // Store property data
        properties[tokenId] = PropertyData({
            propertyId: propertyId,
            propertyValue: propertyValue,
            propertyAddress: propertyAddress,
            squareFootage: squareFootage,
            propertyType: propertyType,
            yearBuilt: yearBuilt,
            isTokenized: true,
            isVerified: false, // Requires separate verification
            originalOwner: to,
            mintTimestamp: block.timestamp,
            legalDocumentsHash: legalDocumentsHash,
            appraisalHash: appraisalHash
        });
        
        // Map property ID to token ID
        propertyIdToTokenId[propertyId] = tokenId;
        
        emit PropertyTokenized(tokenId, propertyId, to, propertyValue, propertyAddress);
        
        return tokenId;
    }
    
    /**
     * @dev Verify property ownership and legal status
     * @param tokenId Token ID to verify
     */
    function verifyProperty(uint256 tokenId) external onlyAuthorizedMinter tokenExists(tokenId) {
        properties[tokenId].isVerified = true;
        emit PropertyVerified(tokenId, msg.sender);
    }
    
    /**
     * @dev Update property value (by verified appraiser)
     * @param tokenId Token ID to update
     * @param newValue New property value
     */
    function updatePropertyValue(uint256 tokenId, uint256 newValue) 
        external 
        onlyVerifiedAppraiser 
        tokenExists(tokenId) 
    {
        require(newValue > 0, "Value must be greater than 0");
        
        uint256 oldValue = properties[tokenId].propertyValue;
        properties[tokenId].propertyValue = newValue;
        
        emit PropertyValueUpdated(tokenId, oldValue, newValue);
    }
    
    /**
     * @dev Authorize an address to mint property NFTs
     * @param minter Address to authorize
     */
    function authorizeMinter(address minter) external onlyOwner {
        require(minter != address(0), "Cannot authorize zero address");
        authorizedMinters[minter] = true;
        emit MinterAuthorized(minter);
    }
    
    /**
     * @dev Revoke minting authorization
     * @param minter Address to revoke
     */
    function revokeMinter(address minter) external onlyOwner {
        authorizedMinters[minter] = false;
        emit MinterRevoked(minter);
    }
    
    /**
     * @dev Verify an appraiser
     * @param appraiser Address to verify
     */
    function verifyAppraiser(address appraiser) external onlyOwner {
        require(appraiser != address(0), "Cannot verify zero address");
        verifiedAppraisers[appraiser] = true;
        emit AppraiserVerified(appraiser);
    }
    
    /**
     * @dev Get property data for a token
     * @param tokenId Token ID to query
     */
    function getPropertyData(uint256 tokenId) 
        external 
        view 
        tokenExists(tokenId) 
        returns (PropertyData memory) 
    {
        return properties[tokenId];
    }
    
    /**
     * @dev Get all token IDs owned by an address
     * @param owner Address to query
     */
    function getTokensByOwner(address owner) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(owner);
        uint256[] memory tokens = new uint256[](balance);
        
        for (uint256 i = 0; i < balance; i++) {
            tokens[i] = tokenOfOwnerByIndex(owner, i);
        }
        
        return tokens;
    }
    
    /**
     * @dev Check if property is ready for lending (verified and tokenized)
     * @param tokenId Token ID to check
     */
    function isPropertyLendingReady(uint256 tokenId) 
        external 
        view 
        tokenExists(tokenId) 
        returns (bool) 
    {
        PropertyData memory prop = properties[tokenId];
        return prop.isTokenized && prop.isVerified;
    }
    
    /**
     * @dev Pause contract (emergency)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Get total number of properties tokenized
     */
    function getTotalProperties() external view returns (uint256) {
        return _tokenIdCounter.current();
    }
    
    // Required overrides for multiple inheritance
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
        
        // Clean up property data
        string memory propertyId = properties[tokenId].propertyId;
        delete properties[tokenId];
        delete propertyIdToTokenId[propertyId];
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