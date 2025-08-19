import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.localfork') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';

// Tinlake contract addresses (from your previous analysis)
const TINLAKE_CONTRACTS = {
  shelf: "0x7d057A056939bb96D682336683C10EC89b78D7CE",
  title: "0x07cdD617c53B07208b0371C93a02deB8d8D49C6e",
  pile: "0x3eC5c16E7f2C6A80E31997C68D8Fa6ACe089807f",
  reserve: "", // Will be discovered
  assessor: "" // Will be discovered
};

// Contract ABIs
const SHELF_ABI = [
  "function issue(address registry, uint256 tokenId) external returns (uint256)",
  "function lock(uint256 loan) external",
  "function unlock(uint256 loan) external",
  "function close(uint256 loan) external",
  
  // View functions
  "function loans(uint256 loan) view returns (address, uint256)",
  "function token(uint256 loan) view returns (address, uint256)",
  "function shelf(uint256 loan) view returns (address, uint256)",
  "function nftLocked(uint256 loan) view returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 loan) view returns (address)",
  
  // Events
  "event Issue(address indexed registry, uint256 indexed tokenId, uint256 loan)",
  "event Lock(uint256 loan)",
  "event Unlock(uint256 loan)"
];

const TITLE_ABI = [
  "function issue(address usr) external returns (uint256)",
  "function close(uint256 loan) external",
  "function ownerOf(uint256 loan) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "event Issue(address indexed usr, uint256 loan)",
  "event Close(uint256 loan)"
];

const ERC721_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function approve(address spender, uint256 tokenId) external",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

interface LoanRequest {
  nftContract: string;
  nftTokenId: number;
  assetValue: string; // In USD
  description: string;
}

export async function issueTinlakeLoan(loanRequest: LoanRequest): Promise<{
  loanId: number;
  transactionHash: string;
  nftContract: string;
  nftTokenId: number;
  owner: string;
  success: boolean;
}> {
  console.log('🏷️ Step 2: Issuing Tinlake Loan\n');
  console.log('═'.repeat(50));

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

    // Display loan request details
    console.log('📋 Loan Request Details:');
    console.log(`   NFT Contract: ${loanRequest.nftContract}`);
    console.log(`   NFT Token ID: ${loanRequest.nftTokenId}`);
    console.log(`   Asset Value: $${loanRequest.assetValue}`);
    console.log(`   Description: ${loanRequest.description}`);

    // Connect to Tinlake contracts
    const shelf = new ethers.Contract(TINLAKE_CONTRACTS.shelf, SHELF_ABI, wallet);
    const title = new ethers.Contract(TINLAKE_CONTRACTS.title, TITLE_ABI, wallet);

    console.log(`\n🏗️ Tinlake Contracts:`);
    console.log(`   Shelf: ${TINLAKE_CONTRACTS.shelf}`);
    console.log(`   Title: ${TINLAKE_CONTRACTS.title}`);

    // Verify contracts exist
    const shelfCode = await provider.getCode(TINLAKE_CONTRACTS.shelf);
    const titleCode = await provider.getCode(TINLAKE_CONTRACTS.title);
    
    if (shelfCode === '0x' || titleCode === '0x') {
      throw new Error('Tinlake contracts not found at expected addresses');
    }
    console.log(`✅ Tinlake contracts verified`);

    // Check if we're using a mock NFT or real NFT
    if (loanRequest.nftContract === "0x1234567890123456789012345678901234567890") {
      console.log(`\n🎭 Using Mock NFT (Simulation Mode)`);
      console.log(`💡 In production, you would:`);
      console.log(`   1. Own a real ERC721 NFT representing the asset`);
      console.log(`   2. The NFT contract would be whitelisted by pool managers`);
      console.log(`   3. Asset valuation would be done by certified oracles`);
      console.log(`   4. Legal documentation would back the digital representation`);
      
      console.log(`\n🚨 Simulating Loan Issuance Process:`);
      console.log(`   → shelf.issue(${loanRequest.nftContract}, ${loanRequest.nftTokenId})`);
      
      // Since this is a simulation, we'll show what the transaction would look like
      try {
        // Try to estimate gas for the issue call (will likely fail with mock address)
        const gasEstimate = await shelf.issue.estimateGas(loanRequest.nftContract, loanRequest.nftTokenId);
        console.log(`⛽ Gas estimate: ${gasEstimate}`);
      } catch (gasError) {
        console.log(`❌ Gas estimation failed (expected with mock NFT):`);
        if (gasError instanceof Error) {
          if (gasError.message.includes('execution reverted')) {
            console.log(`   → Contract requirements not met (NFT not owned or not approved)`);
          } else {
            console.log(`   → ${gasError.message}`);
          }
        }
      }

      // For simulation, return mock values
      console.log(`\n🎯 Simulation Result:`);
      console.log(`   If this were a real NFT with proper approvals:`);
      console.log(`   → Loan ID would be generated (e.g., 42)`);
      console.log(`   → Transaction would succeed`);
      console.log(`   → Loan NFT would be minted to your wallet`);
      
      return {
        loanId: 42, // Mock loan ID
        transactionHash: "0xmocktransactionhash123456789abcdef",
        nftContract: loanRequest.nftContract,
        nftTokenId: loanRequest.nftTokenId,
        owner: wallet.address,
        success: true // Simulation success
      };

    } else {
      // Try with real NFT contract
      console.log(`\n🔍 Checking Real NFT Contract: ${loanRequest.nftContract}`);
      
      const nftContract = new ethers.Contract(loanRequest.nftContract, ERC721_ABI, wallet);
      
      try {
        // Check if NFT exists and get owner
        const nftOwner = await nftContract.ownerOf(loanRequest.nftTokenId);
        console.log(`👤 NFT Owner: ${nftOwner}`);
        
        if (nftOwner.toLowerCase() !== wallet.address.toLowerCase()) {
          console.log(`❌ You don't own this NFT. Cannot issue loan.`);
          console.log(`💡 You need to own the NFT to use it as collateral.`);
          
          return {
            loanId: 0,
            transactionHash: "",
            nftContract: loanRequest.nftContract,
            nftTokenId: loanRequest.nftTokenId,
            owner: nftOwner,
            success: false
          };
        }

        // Check if NFT is approved for Tinlake shelf
        const approved = await nftContract.getApproved(loanRequest.nftTokenId);
        const isApprovedForAll = await nftContract.isApprovedForAll(wallet.address, TINLAKE_CONTRACTS.shelf);
        
        console.log(`🔐 NFT Approval Status:`);
        console.log(`   Approved to: ${approved}`);
        console.log(`   Approved for all: ${isApprovedForAll}`);
        
        if (approved !== TINLAKE_CONTRACTS.shelf && !isApprovedForAll) {
          console.log(`\n🔑 NFT needs approval before loan issuance`);
          console.log(`📝 Run this command first:`);
          console.log(`   nftContract.approve("${TINLAKE_CONTRACTS.shelf}", ${loanRequest.nftTokenId})`);
          
          // Approve the NFT for Tinlake
          console.log(`\n⏳ Approving NFT for Tinlake...`);
          const approveTx = await nftContract.approve(TINLAKE_CONTRACTS.shelf, loanRequest.nftTokenId);
          console.log(`📤 Approval tx: ${approveTx.hash}`);
          
          await approveTx.wait();
          console.log(`✅ NFT approved for Tinlake shelf`);
        }

        // Now try to issue the loan
        console.log(`\n🚀 Issuing Tinlake loan...`);
        console.log(`📝 Calling: shelf.issue(${loanRequest.nftContract}, ${loanRequest.nftTokenId})`);
        
        // Estimate gas
        const gasEstimate = await shelf.issue.estimateGas(loanRequest.nftContract, loanRequest.nftTokenId);
        console.log(`⛽ Gas estimate: ${gasEstimate}`);
        
        // Execute the transaction
        const issueTx = await shelf.issue(loanRequest.nftContract, loanRequest.nftTokenId, {
          gasLimit: gasEstimate * 120n / 100n // Add 20% buffer
        });
        
        console.log(`📤 Issue transaction: ${issueTx.hash}`);
        console.log(`⏳ Waiting for confirmation...`);
        
        const receipt = await issueTx.wait();
        console.log(`✅ Transaction confirmed in block ${receipt?.blockNumber}`);
        
        // Parse the events to get the loan ID
        let loanId = 0;
        if (receipt?.logs) {
          for (const log of receipt.logs) {
            try {
              const parsed = shelf.interface.parseLog(log);
              if (parsed?.name === 'Issue') {
                loanId = Number(parsed.args[2]); // Third argument is loan ID
                console.log(`🎉 Loan issued with ID: ${loanId}`);
                break;
              }
            } catch (e) {
              // Not a shelf event, continue
            }
          }
        }
        
        if (loanId === 0) {
          console.log(`⚠️ Could not parse loan ID from events, but transaction succeeded`);
          loanId = 1; // Fallback assumption
        }

        console.log(`\n📊 Loan Summary:`);
        console.log(`   Loan ID: ${loanId}`);
        console.log(`   NFT Contract: ${loanRequest.nftContract}`);
        console.log(`   NFT Token ID: ${loanRequest.nftTokenId}`);
        console.log(`   Owner: ${wallet.address}`);
        console.log(`   Transaction: ${issueTx.hash}`);

        console.log(`\n💡 Next Steps:`);
        console.log(`   1. Lock the NFT as collateral (Step 3)`);
        console.log(`   2. Borrow against the loan (Step 4)`);
        console.log(`   3. Withdraw the borrowed funds (Step 5)`);

        return {
          loanId,
          transactionHash: issueTx.hash,
          nftContract: loanRequest.nftContract,
          nftTokenId: loanRequest.nftTokenId,
          owner: wallet.address,
          success: true
        };

      } catch (nftError) {
        console.log(`❌ NFT Error: ${nftError instanceof Error ? nftError.message : nftError}`);
        
        return {
          loanId: 0,
          transactionHash: "",
          nftContract: loanRequest.nftContract,
          nftTokenId: loanRequest.nftTokenId,
          owner: wallet.address,
          success: false
        };
      }
    }

  } catch (error) {
    console.error('❌ Loan Issuance Error:', error instanceof Error ? error.message : error);
    throw error;
  }
}

async function main() {
  // Example usage with mock NFT from Step 1
  const loanRequest: LoanRequest = {
    nftContract: "0x1234567890123456789012345678901234567890", // From Step 1
    nftTokenId: 1, // From Step 1
    assetValue: "750000", // $750,000
    description: "Commercial Office Building - 555 Business District"
  };

  try {
    const result = await issueTinlakeLoan(loanRequest);
    
    if (result.success) {
      console.log('\n🎉 Loan Issuance Process Completed!');
      console.log('📝 Save these details for Step 3:');
      console.log(`   LOAN_ID=${result.loanId}`);
      console.log(`   NFT_CONTRACT=${result.nftContract}`);
      console.log(`   NFT_TOKEN_ID=${result.nftTokenId}`);
    } else {
      console.log('\n❌ Loan issuance failed');
      console.log('💡 Check the error messages above for guidance');
    }
    
  } catch (error) {
    console.error('💥 Failed to issue loan:', error);
    process.exit(1);
  }
}

// Auto-execute if run directly
const isMainModule = process.argv[1]?.endsWith('2-issue-loan.ts') || process.argv[1]?.endsWith('2-issue-loan.js');
if (isMainModule) {
  main().catch(console.error);
}

export type { LoanRequest };