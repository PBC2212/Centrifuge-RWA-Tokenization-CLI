import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.localfork') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';

// For simplicity, we'll use a mock NFT approach since we're testing the Tinlake workflow
// In production, you'd have a real NFT contract representing real-world assets

interface AssetInfo {
  assetType: 'invoice' | 'real_estate' | 'equipment' | 'inventory' | 'other';
  description: string;
  value: string; // In USD
  maturityDate?: string;
  issuer: string;
  location?: string;
}

export async function simulateRealWorldAsset(assetInfo: AssetInfo): Promise<{
  mockContractAddress: string;
  mockTokenId: number;
  owner: string;
  ready: boolean;
}> {
  console.log('🎨 Simulating Real-World Asset NFT for Tinlake Workflow...\n');

  try {
    const privateKey = process.env.ETHEREUM_ADMIN_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('ETHEREUM_ADMIN_PRIVATE_KEY not found in environment');
    }

    // Connect to provider
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Test connection
    const network = await provider.getNetwork();
    console.log(`🌐 Network: ${network.name || 'localhost'} (Chain ID: ${network.chainId})`);
    console.log(`💼 Wallet: ${wallet.address}`);
    
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);

    // Display asset information
    console.log('📋 Real-World Asset Information:');
    console.log(`   Type: ${assetInfo.assetType}`);
    console.log(`   Description: ${assetInfo.description}`);
    console.log(`   Estimated Value: $${assetInfo.value}`);
    console.log(`   Asset Originator: ${assetInfo.issuer}`);
    if (assetInfo.maturityDate) console.log(`   Maturity Date: ${assetInfo.maturityDate}`);
    if (assetInfo.location) console.log(`   Location: ${assetInfo.location}`);

    // For the Tinlake workflow demonstration, we'll use these mock values
    // that represent what a real NFT deployment would produce
    const mockContractAddress = "0x1234567890123456789012345678901234567890"; // Mock NFT contract
    const mockTokenId = 1; // First token representing this asset

    console.log(`\n🎭 Mock NFT Details (for Tinlake demonstration):`);
    console.log(`   Contract Address: ${mockContractAddress}`);
    console.log(`   Token ID: ${mockTokenId}`);
    console.log(`   Owner: ${wallet.address}`);

    console.log(`\n📝 What this represents:`);
    console.log(`   • In production, this would be a real ERC721 contract`);
    console.log(`   • The NFT would be backed by actual legal documentation`);
    console.log(`   • Asset valuation would be done by certified appraisers`);
    console.log(`   • Pool managers would verify asset authenticity`);

    console.log(`\n✅ Asset Simulation Complete!`);
    console.log(`💡 Next Step: Use these values in Tinlake loan issuance`);
    console.log(`   NFT_CONTRACT=${mockContractAddress}`);
    console.log(`   NFT_TOKEN_ID=${mockTokenId}`);
    console.log(`   ASSET_VALUE=$${assetInfo.value}`);

    return {
      mockContractAddress,
      mockTokenId,
      owner: wallet.address,
      ready: true
    };

  } catch (error) {
    console.error('❌ Asset Simulation Error:', error instanceof Error ? error.message : error);
    throw error;
  }
}

// Alternative: Use an existing NFT contract from the mainnet fork
export async function findExistingNFT(): Promise<{
  contractAddress: string;
  tokenId: number;
  owner: string;
  available: boolean;
}> {
  console.log('🔍 Looking for existing NFTs in mainnet fork...\n');

  try {
    const privateKey = process.env.ETHEREUM_ADMIN_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('ETHEREUM_ADMIN_PRIVATE_KEY not found in environment');
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Some well-known NFT contracts on mainnet that might have tokens
    const knownNFTs = [
      { name: "CryptoPunks", address: "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB" },
      { name: "Bored Ape Yacht Club", address: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" },
      { name: "Art Blocks", address: "0xa7d8d9ef8D8Ce8992Df33D8b8CF4Aebabd5bD270" },
      { name: "Azuki", address: "0xED5AF388653567Af2F388E6224dC7C4b3241C544" }
    ];

    const erc721ABI = [
      "function ownerOf(uint256 tokenId) view returns (address)",
      "function balanceOf(address owner) view returns (uint256)",
      "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
      "function name() view returns (string)",
      "function symbol() view returns (string)"
    ];

    for (const nft of knownNFTs) {
      try {
        const contract = new ethers.Contract(nft.address, erc721ABI, provider);
        
        // Check if contract exists
        const code = await provider.getCode(nft.address);
        if (code === '0x') continue;

        // Try to get contract name
        const name = await contract.name().catch(() => nft.name);
        console.log(`🔍 Checking ${name} (${nft.address})`);

        // Check if wallet owns any tokens (unlikely but possible in fork)
        const balance = await contract.balanceOf(wallet.address).catch(() => 0n);
        
        if (balance > 0n) {
          console.log(`✅ Found ${balance} tokens owned by wallet!`);
          // Get first token ID
          const tokenId = await contract.tokenOfOwnerByIndex(wallet.address, 0);
          
          return {
            contractAddress: nft.address,
            tokenId: Number(tokenId),
            owner: wallet.address,
            available: true
          };
        } else {
          // Check if token 1 exists and get its owner
          try {
            const owner = await contract.ownerOf(1);
            console.log(`   Token 1 exists, owned by: ${owner}`);
          } catch (e) {
            console.log(`   No token 1 found`);
          }
        }
        
      } catch (e) {
        console.log(`   ❌ Error checking ${nft.name}: contract not accessible`);
      }
    }

    console.log(`\n❌ No owned NFTs found in wallet ${wallet.address}`);
    console.log(`💡 This is expected - you don't own NFTs in the mainnet fork`);
    console.log(`🚀 Proceeding with simulated NFT for demonstration...`);

    return {
      contractAddress: "0x0000000000000000000000000000000000000000",
      tokenId: 0,
      owner: wallet.address,
      available: false
    };

  } catch (error) {
    console.error('❌ NFT Search Error:', error instanceof Error ? error.message : error);
    return {
      contractAddress: "0x0000000000000000000000000000000000000000",
      tokenId: 0,
      owner: "",
      available: false
    };
  }
}

async function main() {
  console.log('🎯 Step 1: Real-World Asset Representation\n');
  console.log('═'.repeat(60));

  // First, try to find existing NFTs
  const existingNFT = await findExistingNFT();
  
  if (existingNFT.available) {
    console.log('\n🎉 Found existing NFT to use!');
    console.log(`📝 Use these values for Step 2:`);
    console.log(`   NFT_CONTRACT=${existingNFT.contractAddress}`);
    console.log(`   NFT_TOKEN_ID=${existingNFT.tokenId}`);
  } else {
    // Use simulated asset
    const assetInfo: AssetInfo = {
      assetType: 'real_estate',
      description: 'Commercial Office Building - 555 Business District',
      value: '750000', // $750,000 USD
      issuer: 'Commercial Real Estate Holdings LLC',
      location: 'Chicago, IL',
      maturityDate: '2026-06-30'
    };

    const mockAsset = await simulateRealWorldAsset(assetInfo);
    
    console.log('\n🎉 Asset Simulation Complete!');
    console.log(`📝 Use these values for Step 2 (Tinlake Loan Issuance):`);
    console.log(`   NFT_CONTRACT=${mockAsset.mockContractAddress}`);
    console.log(`   NFT_TOKEN_ID=${mockAsset.mockTokenId}`);
  }

  console.log('\n🚀 Ready for Step 2: Issue Tinlake Loan!');
}

// Auto-execute if run directly
const isMainModule = process.argv[1]?.endsWith('1-simple-nft.ts') || process.argv[1]?.endsWith('1-simple-nft.js');
if (isMainModule) {
  main().catch(console.error);
}

export type { AssetInfo };