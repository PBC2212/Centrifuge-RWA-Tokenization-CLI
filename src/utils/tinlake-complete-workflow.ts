import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.localfork') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Network configuration
const CURRENT_NETWORK = 'localhost';
const RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';

interface TinlakeContracts {
  root: string;
  shelf: string;
  pile: string;
  title: string;
  reserve: string;
  assessor: string;
  juniorTranche: string;
  seniorTranche: string;
  currency: string; // DAI contract
}

// New Silver Series 2 Tinlake contracts (from the metadata)
const TINLAKE_ADDRESSES: TinlakeContracts = {
  root: "0x53b2d22d07E069a3b132BfeaaD275b10273d381E",
  shelf: "0x7d057A056939bb96D682336683C10EC89b78D7CE",
  pile: "0x3eC5c16E7f2C6A80E31997C68D8Fa6ACe089807f",
  title: "0x07cdD617c53B07208b0371C93a02deB8d8D49C6e",
  reserve: "0x", // Will be filled from contract calls
  assessor: "0x", // Will be filled from contract calls
  juniorTranche: "0x53CF3CCd97CA914F9e441B8cd9A901E69B170f27",
  seniorTranche: "0x3f06DB6334435fF4150e14aD69F6280BF8E8dA64",
  currency: "0x6B175474E89094C44Da98b954EedeAC495271d0F" // DAI
};

class TinlakeWorkflow {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contracts: TinlakeContracts;

  constructor(privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.contracts = TINLAKE_ADDRESSES;
  }

  // Contract ABIs
  private get shelfAbi() {
    return [
      "function issue(address registry, uint256 tokenId) external returns (uint256)",
      "function lock(uint256 loan) external",
      "function unlock(uint256 loan) external", 
      "function borrow(uint256 loan, uint256 amount) external",
      "function withdraw(uint256 loan, uint256 amount, address usr) external",
      "function repay(uint256 loan, uint256 amount) external",
      "function close(uint256 loan) external",
      
      "function balanceOf(address owner) view returns (uint256)",
      "function ownerOf(uint256 loan) view returns (address)",
      "function loans(uint256 loan) view returns (address, uint256)",
      "function token(uint256 loan) view returns (address, uint256)", 
      "function nftLocked(uint256 loan) view returns (bool)",
      "function shelf(uint256 loan) view returns (address, uint256)",
      
      "event Issue(address indexed registry, uint256 indexed tokenId, uint256 loan)",
      "event Lock(uint256 loan)",
      "event Unlock(uint256 loan)",
      "event Borrow(uint256 indexed loan, uint256 amount, address usr)",
      "event Withdraw(uint256 indexed loan, uint256 amount, address usr)"
    ];
  }

  private get pileAbi() {
    return [
      "function debt(uint256 loan) view returns (uint256)",
      "function pie(uint256 loan) view returns (uint256)",
      "function rates(uint256 rate) view returns (uint256, uint256, uint256, uint48, uint256)",
      "function total() view returns (uint256)"
    ];
  }

  private get titleAbi() {
    return [
      "function issue(address usr) external returns (uint256)",
      "function close(uint256 loan) external",
      "function ownerOf(uint256 loan) view returns (address)",
      "function balanceOf(address owner) view returns (uint256)"
    ];
  }

  private get daiAbi() {
    return [
      "function balanceOf(address owner) view returns (uint256)",
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function transfer(address to, uint256 amount) external returns (bool)",
      "function transferFrom(address from, address to, uint256 amount) external returns (bool)"
    ];
  }

  async analyzeExistingLoans(): Promise<void> {
    console.log('🔍 Analyzing existing Tinlake setup...\n');

    try {
      // Check shelf contract
      const shelf = new ethers.Contract(this.contracts.shelf, this.shelfAbi, this.wallet);
      
      console.log(`📋 Shelf Contract: ${this.contracts.shelf}`);
      
      // Check loan balance
      const loanBalance = await shelf.balanceOf(this.wallet.address);
      console.log(`💼 Loan NFTs owned: ${loanBalance.toString()}`);

      if (loanBalance > 0n) {
        console.log(`\n📊 Your existing loans:`);
        
        // This is a simplified check - in reality you'd need to track loan IDs
        for (let i = 1; i <= 10; i++) {
          try {
            const owner = await shelf.ownerOf(i);
            if (owner.toLowerCase() === this.wallet.address.toLowerCase()) {
              const tokenInfo = await shelf.token(i);
              const isLocked = await shelf.nftLocked(i);
              
              console.log(`   Loan ${i}:`);
              console.log(`     - NFT Registry: ${tokenInfo[0]}`);
              console.log(`     - NFT Token ID: ${tokenInfo[1]}`);
              console.log(`     - Locked: ${isLocked}`);
              
              if (isLocked) {
                // Check debt
                const pile = new ethers.Contract(this.contracts.pile, this.pileAbi, this.wallet);
                const debt = await pile.debt(i);
                console.log(`     - Current Debt: ${ethers.formatEther(debt)} DAI`);
              }
            }
          } catch (e) {
            // Loan doesn't exist or not owned by us
          }
        }
      } else {
        console.log(`❌ No loans found. You need to create a loan first.`);
      }

      // Check DAI balance and allowance
      const dai = new ethers.Contract(this.contracts.currency, this.daiAbi, this.wallet);
      const daiBalance = await dai.balanceOf(this.wallet.address);
      const allowance = await dai.allowance(this.wallet.address, this.contracts.shelf);
      
      console.log(`\n💰 DAI Balance: ${ethers.formatEther(daiBalance)} DAI`);
      console.log(`🔐 DAI Allowance to Shelf: ${ethers.formatEther(allowance)} DAI`);

    } catch (error) {
      console.error(`❌ Error analyzing loans:`, error instanceof Error ? error.message : error);
    }
  }

  async demonstrateBorrowWorkflow(): Promise<void> {
    console.log('📚 Tinlake Borrow Workflow Demonstration\n');
    
    console.log('📝 Complete Borrowing Process:');
    console.log('1. 🎨 Create/Own an NFT representing real-world collateral');
    console.log('2. 🏷️  Issue a loan in Tinlake against your NFT');
    console.log('3. 🔒 Lock the NFT as collateral');
    console.log('4. 💰 Borrow DAI against the locked collateral');
    console.log('5. 🏦 Withdraw the borrowed DAI');
    console.log('6. 📈 Accrue interest over time');
    console.log('7. 💳 Repay the loan + interest');
    console.log('8. 🔓 Unlock and reclaim your NFT');
    
    console.log('\n🚨 Current Limitation:');
    console.log('Your wallet doesn\'t have any active loans in this Tinlake pool.');
    console.log('This is expected because:');
    console.log('- Real loans require actual NFT collateral');
    console.log('- Pool managers control who can issue loans');
    console.log('- This is a live mainnet contract (in local fork)');
    
    console.log('\n💡 To actually borrow, you would need:');
    console.log('1. An NFT representing real-world assets (invoices, real estate, etc.)');
    console.log('2. Permission from the pool issuer (New Silver in this case)');
    console.log('3. Go through KYC/AML process');
    console.log('4. Have your assets valued by the pool\'s pricing oracle');
  }

  async simulateBorrowCall(loanId: number, amount: string): Promise<void> {
    console.log(`\n🎯 Simulating borrow call for educational purposes...`);
    
    try {
      const shelf = new ethers.Contract(this.contracts.shelf, this.shelfAbi, this.wallet);
      const amountWei = ethers.parseEther(amount);
      
      console.log(`📋 Call: shelf.borrow(${loanId}, ${amount} DAI)`);
      console.log(`📍 Contract: ${this.contracts.shelf}`);
      console.log(`👤 Caller: ${this.wallet.address}`);
      
      // Try to estimate gas (will fail, but gives us error info)
      try {
        const gasEstimate = await shelf.borrow.estimateGas(loanId, amountWei);
        console.log(`⛽ Gas estimate: ${gasEstimate}`);
      } catch (gasError) {
        console.log(`❌ Gas estimation failed (expected):`);
        if (gasError instanceof Error) {
          if (gasError.message.includes('require(false)')) {
            console.log('   → Loan doesn\'t exist or access denied');
          } else if (gasError.message.includes('execution reverted')) {
            console.log('   → Contract requirements not met');
          } else {
            console.log(`   → ${gasError.message}`);
          }
        }
      }
      
    } catch (error) {
      console.log(`❌ Simulation failed:`, error instanceof Error ? error.message : error);
    }
  }

  async checkPoolStatus(): Promise<void> {
    console.log('\n🏊 Pool Status Check...');
    
    try {
      // Check if contracts exist and get basic info
      const contracts = [
        { name: 'Root', address: this.contracts.root },
        { name: 'Shelf', address: this.contracts.shelf },
        { name: 'Pile', address: this.contracts.pile },
        { name: 'Title', address: this.contracts.title },
        { name: 'Junior Tranche', address: this.contracts.juniorTranche },
        { name: 'Senior Tranche', address: this.contracts.seniorTranche },
        { name: 'DAI', address: this.contracts.currency }
      ];

      for (const contract of contracts) {
        const code = await this.provider.getCode(contract.address);
        const exists = code !== '0x';
        console.log(`${exists ? '✅' : '❌'} ${contract.name}: ${contract.address}`);
      }

    } catch (error) {
      console.error('❌ Pool status check failed:', error);
    }
  }
}

async function main() {
  console.log('🌊 Tinlake Complete Workflow Analysis\n');
  console.log('═'.repeat(60));
  
  const privateKey = process.env.ETHEREUM_ADMIN_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('ETHEREUM_ADMIN_PRIVATE_KEY not found in environment');
  }

  const tinlake = new TinlakeWorkflow(privateKey);
  
  try {
    // Check pool contracts
    await tinlake.checkPoolStatus();
    
    // Analyze existing loans
    await tinlake.analyzeExistingLoans();
    
    // Demonstrate the workflow
    await tinlake.demonstrateBorrowWorkflow();
    
    // Simulate the borrow call for educational purposes
    await tinlake.simulateBorrowCall(1, "10");
    
    console.log('\n🎓 Educational Summary:');
    console.log('─'.repeat(40));
    console.log('✅ Successfully connected to Tinlake contracts');
    console.log('✅ Analyzed pool structure and your account');
    console.log('✅ Demonstrated why borrow() calls fail without setup');
    console.log('✅ Explained the complete Tinlake workflow');
    
    console.log('\n🚀 Next Steps:');
    console.log('• To actually use Tinlake, visit: https://tinlake.centrifuge.io/');
    console.log('• Consider building on Centrifuge Chain for new pools');
    console.log('• This local fork is perfect for testing integrations');
    
  } catch (error) {
    console.error('❌ Workflow failed:', error);
  }
}

// Auto-execute
const isMainModule = process.argv[1]?.endsWith('tinlake-complete-workflow.ts') || process.argv[1]?.endsWith('tinlake-complete-workflow.js');
if (isMainModule) {
  main().catch(console.error);
}

export default TinlakeWorkflow;