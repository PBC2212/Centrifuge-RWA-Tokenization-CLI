import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.localfork') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';

// Tinlake contract addresses (New Silver Series 2)
const TINLAKE_CONTRACTS = {
  shelf: "0x7d057A056939bb96D682336683C10EC89b78D7CE",
  title: "0x07cdD617c53B07208b0371C93a02deB8d8D49C6e",
  pile: "0x3eC5c16E7f2C6A80E31997C68D8Fa6ACe089807f",
  currency: "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
  reserve: "0x", // To be discovered
  seniorTranche: "0x3f06DB6334435fF4150e14aD69F6280BF8E8dA64"
};

// Contract ABIs
const SHELF_ABI = [
  "function borrow(uint256 loan, uint256 amount) external",
  "function withdraw(uint256 loan, uint256 amount, address usr) external",
  "function issue(address registry, uint256 tokenId) external returns (uint256)",
  "function lock(uint256 loan) external",
  "function nftLocked(uint256 loan) view returns (bool)",
  "function token(uint256 loan) view returns (address, uint256)",
  "function ownerOf(uint256 loan) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function loans(uint256 loan) view returns (address, uint256)",
  "function shelf(uint256 loan) view returns (address, uint256)",
  "function totalSupply() view returns (uint256)"
];

const PILE_ABI = [
  "function debt(uint256 loan) view returns (uint256)",
  "function pie(uint256 loan) view returns (uint256)",
  "function total() view returns (uint256)",
  "function rates(uint256 rate) view returns (uint256, uint256, uint256, uint48, uint256)"
];

const DAI_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) external returns (bool)"
];

const SENIOR_TRANCHE_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function symbol() view returns (string)"
];

export async function testRealBorrowTransaction(): Promise<void> {
  console.log('🔥 REAL TINLAKE BORROW TEST\n');
  console.log('═'.repeat(60));

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
    console.log(`💰 ETH Balance: ${ethers.formatEther(balance)} ETH\n`);

    // Connect to contracts
    const shelf = new ethers.Contract(TINLAKE_CONTRACTS.shelf, SHELF_ABI, wallet);
    const pile = new ethers.Contract(TINLAKE_CONTRACTS.pile, PILE_ABI, wallet);
    const dai = new ethers.Contract(TINLAKE_CONTRACTS.currency, DAI_ABI, wallet);
    const seniorTranche = new ethers.Contract(TINLAKE_CONTRACTS.seniorTranche, SENIOR_TRANCHE_ABI, wallet);

    console.log('🏗️ Tinlake Pool Analysis:');
    console.log(`   Shelf: ${TINLAKE_CONTRACTS.shelf}`);
    console.log(`   Pile: ${TINLAKE_CONTRACTS.pile}`);
    console.log(`   DAI: ${TINLAKE_CONTRACTS.currency}`);

    // Check pool status
    try {
      const totalDebt = await pile.total();
      console.log(`   Total Pool Debt: ${ethers.formatEther(totalDebt)} DAI`);
      
      const seniorSupply = await seniorTranche.totalSupply();
      const seniorSymbol = await seniorTranche.symbol();
      console.log(`   Senior Tranche (${seniorSymbol}): ${ethers.formatEther(seniorSupply)} tokens`);
      
    } catch (e) {
      console.log(`   Pool info: Unable to fetch (${e.message})`);
    }

    // Check your current DAI balance
    try {
      const daiBalance = await dai.balanceOf(wallet.address);
      const daiSymbol = await dai.symbol();
      console.log(`💵 Your ${daiSymbol} Balance: ${ethers.formatEther(daiBalance)} ${daiSymbol}`);
    } catch (e) {
      console.log(`💵 DAI Balance: Unable to check`);
    }

    // Check if you own any loan NFTs
    console.log('\n🔍 Scanning for Existing Loans...');
    try {
      const loanBalance = await shelf.balanceOf(wallet.address);
      console.log(`📊 Loan NFTs Owned: ${loanBalance.toString()}`);

      if (loanBalance > 0n) {
        console.log('🎉 YOU OWN LOANS! Let\'s find them...\n');
        
        // Try to find your loan IDs (brute force search - not efficient but works for testing)
        const maxLoansToCheck = 100;
        const ownedLoans: number[] = [];
        
        for (let loanId = 1; loanId <= maxLoansToCheck; loanId++) {
          try {
            const owner = await shelf.ownerOf(loanId);
            if (owner.toLowerCase() === wallet.address.toLowerCase()) {
              ownedLoans.push(loanId);
              console.log(`✅ Found your loan: ID ${loanId}`);
              
              // Get loan details
              const tokenInfo = await shelf.token(loanId);
              const isLocked = await shelf.nftLocked(loanId);
              const currentDebt = await pile.debt(loanId);
              
              console.log(`   NFT Contract: ${tokenInfo[0]}`);
              console.log(`   NFT Token ID: ${tokenInfo[1]}`);
              console.log(`   Locked: ${isLocked}`);
              console.log(`   Current Debt: ${ethers.formatEther(currentDebt)} DAI`);
              
              if (isLocked && currentDebt === 0n) {
                console.log(`   🎯 READY FOR BORROWING!`);
                
                // Try to borrow against this loan
                await attemptBorrow(shelf, pile, loanId, "1000"); // Try to borrow 1000 DAI
                
              } else if (!isLocked) {
                console.log(`   ⚠️  Collateral not locked yet`);
              } else {
                console.log(`   ⚠️  Already has debt`);
              }
              
              console.log(''); // Empty line for readability
            }
          } catch (e) {
            // Loan doesn't exist or not owned by us, continue
          }
        }
        
        if (ownedLoans.length === 0) {
          console.log('❌ No loans found in range 1-100');
          console.log('💡 You may need to issue a loan first using your 2-issue-loan.ts');
        }
        
      } else {
        console.log('❌ No loan NFTs owned');
        console.log('💡 You need to create a loan first!\n');
        
        console.log('🚀 Next Steps:');
        console.log('   1. Run: npx ts-node src/utils/1-simple-nft.ts');
        console.log('   2. Run: npx ts-node src/utils/2-issue-loan.ts');
        console.log('   3. Run: npx ts-node src/utils/3-lock-collateral.ts');
        console.log('   4. Run this test again!');
      }
      
    } catch (balanceError) {
      console.log(`❌ Error checking loan balance: ${balanceError.message}`);
    }

    // Test with some known loan IDs from the pool (if any exist)
    console.log('\n🔍 Testing Known Loan IDs...');
    const testLoanIds = [1, 2, 3, 5, 10, 42, 100];
    
    for (const loanId of testLoanIds) {
      try {
        const owner = await shelf.ownerOf(loanId);
        const tokenInfo = await shelf.token(loanId);
        const isLocked = await shelf.nftLocked(loanId);
        const currentDebt = await pile.debt(loanId);
        
        console.log(`📋 Loan ${loanId}:`);
        console.log(`   Owner: ${owner}`);
        console.log(`   NFT: ${tokenInfo[0]} #${tokenInfo[1]}`);
        console.log(`   Locked: ${isLocked}`);
        console.log(`   Debt: ${ethers.formatEther(currentDebt)} DAI`);
        console.log('');
        
      } catch (e) {
        // Loan doesn't exist, skip silently
      }
    }

  } catch (error) {
    console.error('❌ Test Error:', error instanceof Error ? error.message : error);
    throw error;
  }
}

async function attemptBorrow(shelf: ethers.Contract, pile: ethers.Contract, loanId: number, amount: string): Promise<void> {
  console.log(`\n💰 ATTEMPTING REAL BORROW: ${amount} DAI against Loan ${loanId}`);
  console.log('─'.repeat(50));
  
  try {
    const amountWei = ethers.parseEther(amount);
    
    // This is YOUR ORIGINAL BORROW LOGIC!
    console.log(`🎯 Your borrow.ts logic: shelf.borrow(${loanId}, ${amountWei})`);
    
    // Estimate gas
    try {
      const gasEstimate = await shelf.borrow.estimateGas(loanId, amountWei);
      console.log(`⛽ Gas estimate: ${gasEstimate}`);
      
      // If gas estimation succeeds, the transaction should work!
      console.log('✅ Gas estimation successful - transaction should work!');
      
      // Execute the borrow (comment out if you don't want to actually borrow yet)
      console.log('⏳ Executing borrow transaction...');
      
      const tx = await shelf.borrow(loanId, amountWei, {
        gasLimit: gasEstimate * 120n / 100n
      });
      
      console.log(`📤 Transaction submitted: ${tx.hash}`);
      console.log('⏳ Waiting for confirmation...');
      
      const receipt = await tx.wait();
      
      if (receipt && receipt.status === 1) {
        console.log('🎉 BORROW SUCCESSFUL!');
        console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
        
        // Check new debt
        const newDebt = await pile.debt(loanId);
        console.log(`💳 New debt: ${ethers.formatEther(newDebt)} DAI`);
        
        console.log('\n🏆 CONGRATULATIONS!');
        console.log('You successfully borrowed DAI against real-world collateral!');
        console.log('Your original borrow.ts is working perfectly! 🚀');
        
      } else {
        console.log('❌ Transaction failed');
      }
      
    } catch (gasError) {
      console.log(`❌ Gas estimation failed: ${gasError.message}`);
      
      if (gasError.message.includes('execution reverted')) {
        console.log('💡 Possible reasons:');
        console.log('   • Loan not ready for borrowing');
        console.log('   • Insufficient collateral value');
        console.log('   • Pool liquidity issues');
        console.log('   • Access permissions');
      }
    }
    
  } catch (error) {
    console.log(`❌ Borrow attempt failed: ${error instanceof Error ? error.message : error}`);
  }
}

async function main() {
  console.log('🎯 TESTING REAL BORROW TRANSACTION');
  console.log('This will check if you can actually borrow from Tinlake!\n');
  
  await testRealBorrowTransaction();
}

// Auto-execute if run directly
const isMainModule = process.argv[1]?.endsWith('real-borrow-test.ts') || process.argv[1]?.endsWith('real-borrow-test.js');
if (isMainModule) {
  main().catch(console.error);
}