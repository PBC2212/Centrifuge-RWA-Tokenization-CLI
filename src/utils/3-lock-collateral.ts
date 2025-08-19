import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.localfork') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';

// Tinlake contract addresses
const TINLAKE_CONTRACTS = {
  shelf: "0x7d057A056939bb96D682336683C10EC89b78D7CE",
  title: "0x07cdD617c53B07208b0371C93a02deB8d8D49C6e",
  pile: "0x3eC5c16E7f2C6A80E31997C68D8Fa6ACe089807f"
};

// Contract ABIs
const SHELF_ABI = [
  "function lock(uint256 loan) external",
  "function unlock(uint256 loan) external",
  "function nftLocked(uint256 loan) view returns (bool)",
  "function token(uint256 loan) view returns (address, uint256)",
  "function ownerOf(uint256 loan) view returns (address)",
  "function loans(uint256 loan) view returns (address, uint256)",
  
  "event Lock(uint256 loan)",
  "event Unlock(uint256 loan)"
];

const TITLE_ABI = [
  "function ownerOf(uint256 loan) view returns (address)",
  "function approve(address spender, uint256 tokenId) external",
  "function getApproved(uint256 tokenId) view returns (address)"
];

interface LockRequest {
  loanId: number;
  nftContract: string;
  nftTokenId: number;
  description: string;
}

export async function lockCollateralNFT(lockRequest: LockRequest): Promise<{
  loanId: number;
  locked: boolean;
  transactionHash: string;
  success: boolean;
}> {
  console.log('🔒 Step 3: Locking Collateral NFT\n');
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

    // Display lock request details
    console.log('📋 Collateral Lock Request:');
    console.log(`   Loan ID: ${lockRequest.loanId}`);
    console.log(`   NFT Contract: ${lockRequest.nftContract}`);
    console.log(`   NFT Token ID: ${lockRequest.nftTokenId}`);
    console.log(`   Description: ${lockRequest.description}`);

    // Connect to Tinlake contracts
    const shelf = new ethers.Contract(TINLAKE_CONTRACTS.shelf, SHELF_ABI, wallet);
    const title = new ethers.Contract(TINLAKE_CONTRACTS.title, TITLE_ABI, wallet);

    console.log(`\n🏗️ Tinlake Contracts:`);
    console.log(`   Shelf: ${TINLAKE_CONTRACTS.shelf}`);
    console.log(`   Title: ${TINLAKE_CONTRACTS.title}`);

    // Verify contracts exist
    const shelfCode = await provider.getCode(TINLAKE_CONTRACTS.shelf);
    if (shelfCode === '0x') {
      throw new Error('Shelf contract not found');
    }
    console.log(`✅ Shelf contract verified`);

    // Check if we're using mock data or real loan
    if (lockRequest.nftContract === "0x1234567890123456789012345678901234567890") {
      console.log(`\n🎭 Mock Loan Detected (Simulation Mode)`);
      console.log(`💡 In production, this step would:`);
      console.log(`   1. Verify you own the loan NFT (from Step 2)`);
      console.log(`   2. Verify the underlying asset NFT still exists`);
      console.log(`   3. Transfer the asset NFT to Tinlake's custody`);
      console.log(`   4. Mark the loan as "collateralized" and ready for borrowing`);
      
      console.log(`\n🚨 Simulating Lock Process:`);
      console.log(`   → shelf.lock(${lockRequest.loanId})`);
      
      // Try to estimate gas (will fail with mock loan ID)
      try {
        const gasEstimate = await shelf.lock.estimateGas(lockRequest.loanId);
        console.log(`⛽ Gas estimate: ${gasEstimate}`);
      } catch (gasError) {
        console.log(`❌ Gas estimation failed (expected with mock loan):`);
        if (gasError instanceof Error) {
          if (gasError.message.includes('execution reverted')) {
            console.log(`   → Loan ${lockRequest.loanId} does not exist or you don't own it`);
          } else {
            console.log(`   → ${gasError.message}`);
          }
        }
      }

      console.log(`\n🎯 Simulation Result:`);
      console.log(`   If this were a real loan:`);
      console.log(`   → NFT would be transferred to Tinlake custody`);
      console.log(`   → Loan status would change to "collateralized"`);
      console.log(`   → You could then borrow against the locked collateral`);
      console.log(`   → Interest would start accruing once you borrow`);
      
      return {
        loanId: lockRequest.loanId,
        locked: true, // Simulation success
        transactionHash: "0xmocklocktrxhash123456789abcdef",
        success: true
      };

    } else {
      // Try with real loan
      console.log(`\n🔍 Checking Real Loan ID: ${lockRequest.loanId}`);
      
      try {
        // First, verify we own the loan NFT
        const loanOwner = await title.ownerOf(lockRequest.loanId);
        console.log(`👤 Loan ${lockRequest.loanId} owner: ${loanOwner}`);
        
        if (loanOwner.toLowerCase() !== wallet.address.toLowerCase()) {
          console.log(`❌ You don't own loan ${lockRequest.loanId}. Cannot lock collateral.`);
          
          return {
            loanId: lockRequest.loanId,
            locked: false,
            transactionHash: "",
            success: false
          };
        }

        // Check if already locked
        const isLocked = await shelf.nftLocked(lockRequest.loanId);
        console.log(`🔒 Current lock status: ${isLocked}`);
        
        if (isLocked) {
          console.log(`✅ Collateral is already locked! Ready for borrowing.`);
          
          return {
            loanId: lockRequest.loanId,
            locked: true,
            transactionHash: "already_locked",
            success: true
          };
        }

        // Get loan details
        const tokenInfo = await shelf.token(lockRequest.loanId);
        console.log(`📋 Loan ${lockRequest.loanId} details:`);
        console.log(`   NFT Contract: ${tokenInfo[0]}`);
        console.log(`   NFT Token ID: ${tokenInfo[1]}`);

        // Attempt to lock the collateral
        console.log(`\n🔒 Locking collateral for loan ${lockRequest.loanId}...`);
        
        // Estimate gas
        const gasEstimate = await shelf.lock.estimateGas(lockRequest.loanId);
        console.log(`⛽ Gas estimate: ${gasEstimate}`);
        
        // Execute lock transaction
        const lockTx = await shelf.lock(lockRequest.loanId, {
          gasLimit: gasEstimate * 120n / 100n
        });
        
        console.log(`📤 Lock transaction: ${lockTx.hash}`);
        console.log(`⏳ Waiting for confirmation...`);
        
        const receipt = await lockTx.wait();
        console.log(`✅ Transaction confirmed in block ${receipt?.blockNumber}`);
        
        // Verify lock status
        const newLockStatus = await shelf.nftLocked(lockRequest.loanId);
        console.log(`🔒 New lock status: ${newLockStatus}`);

        console.log(`\n📊 Lock Summary:`);
        console.log(`   Loan ID: ${lockRequest.loanId}`);
        console.log(`   Locked: ${newLockStatus}`);
        console.log(`   Transaction: ${lockTx.hash}`);
        console.log(`   Block: ${receipt?.blockNumber}`);

        console.log(`\n💡 Next Steps:`);
        console.log(`   1. Collateral is now locked and earning potential`);
        console.log(`   2. You can now borrow against this loan (Step 4)`);
        console.log(`   3. Interest will accrue from the moment you borrow`);

        return {
          loanId: lockRequest.loanId,
          locked: newLockStatus,
          transactionHash: lockTx.hash,
          success: true
        };

      } catch (loanError) {
        console.log(`❌ Lock Error: ${loanError instanceof Error ? loanError.message : loanError}`);
        
        if (loanError instanceof Error) {
          if (loanError.message.includes('execution reverted')) {
            console.log(`💡 Possible reasons:`);
            console.log(`   • Loan ${lockRequest.loanId} doesn't exist`);
            console.log(`   • You don't own the loan NFT`);
            console.log(`   • Underlying asset NFT is not approved for Tinlake`);
            console.log(`   • Loan is in wrong state for locking`);
          }
        }
        
        return {
          loanId: lockRequest.loanId,
          locked: false,
          transactionHash: "",
          success: false
        };
      }
    }

  } catch (error) {
    console.error('❌ Collateral Lock Error:', error instanceof Error ? error.message : error);
    throw error;
  }
}

async function main() {
  // Use values from Step 2
  const lockRequest: LockRequest = {
    loanId: 42, // From Step 2 simulation
    nftContract: "0x1234567890123456789012345678901234567890", // From Step 1
    nftTokenId: 1, // From Step 1
    description: "Commercial Office Building - 555 Business District"
  };

  try {
    const result = await lockCollateralNFT(lockRequest);
    
    if (result.success) {
      console.log('\n🎉 Collateral Lock Process Completed!');
      console.log('📝 Save these details for Step 4:');
      console.log(`   LOAN_ID=${result.loanId}`);
      console.log(`   LOCKED=${result.locked}`);
      console.log(`   READY_FOR_BORROWING=${result.locked}`);
    } else {
      console.log('\n❌ Collateral lock failed');
      console.log('💡 Check the error messages above for guidance');
    }
    
  } catch (error) {
    console.error('💥 Failed to lock collateral:', error);
    process.exit(1);
  }
}

// Auto-execute if run directly
const isMainModule = process.argv[1]?.endsWith('3-lock-collateral.ts') || process.argv[1]?.endsWith('3-lock-collateral.js');
if (isMainModule) {
  main().catch(console.error);
}

export type { LockRequest };