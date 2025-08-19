import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables - check for .env.localfork first, then .env
const envFile = process.env.NODE_ENV === 'localfork' ? '.env.localfork' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), '.env.localfork') }); // Try localfork first
dotenv.config({ path: path.resolve(process.cwd(), '.env') }); // Then .env as fallback

// Network configurations
const NETWORKS = {
  localhost: {
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'http://localhost:8545',
    chainId: 31337,
    name: 'Localhost'
  },
  mainnet: {
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_INFURA_KEY',
    chainId: 1,
    name: 'Ethereum Mainnet'
  }
} as const;

// Configuration - Change this to switch networks
const CURRENT_NETWORK: keyof typeof NETWORKS = 'localhost'; // Change to 'mainnet' for production

export async function borrow(poolId: number, amount: string) {
  console.log('🚀 Starting borrow operation...\n');

  try {
    // Validate inputs
    if (!poolId || poolId < 0) {
      throw new Error('Invalid pool ID provided');
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      throw new Error('Invalid amount provided. Must be a positive number');
    }

    // Get network configuration
    const networkConfig = NETWORKS[CURRENT_NETWORK];
    console.log(`🌐 Network: ${networkConfig.name} (Chain ID: ${networkConfig.chainId})`);

    // Get environment variables
    const privateKey = process.env.ETHEREUM_ADMIN_PRIVATE_KEY;
    const contractAddress = process.env.TINLAKE_BORROW_CONTRACT;

    console.log('🔍 Environment variables check:');
    console.log(`- Private Key: ${privateKey ? '✅ Set' : '❌ Not set'}`);
    console.log(`- Contract Address: ${contractAddress ? '✅ Set' : '❌ Not set'}`);
    console.log(`- RPC URL: ${networkConfig.rpcUrl}\n`);

    if (!privateKey) {
      throw new Error('ETHEREUM_ADMIN_PRIVATE_KEY not set in environment variables');
    }

    if (!contractAddress) {
      throw new Error('TINLAKE_BORROW_CONTRACT not set in environment variables');
    }

    // Validate private key format
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error('Invalid private key format. Must be 64 hex characters prefixed with 0x');
    }

    // Connect to provider
    console.log('🔗 Connecting to network...');
    const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

    // Verify network connection
    try {
      const network = await provider.getNetwork();
      console.log(`✅ Connected to: ${network.name || 'Unknown'} (Chain ID: ${network.chainId})`);
      
      // Warn if chain ID doesn't match expected
      if (network.chainId !== BigInt(networkConfig.chainId)) {
        console.warn(`⚠️  Warning: Expected chain ID ${networkConfig.chainId}, got ${network.chainId}`);
      }
    } catch (networkError) {
      throw new Error(`Failed to connect to network: ${networkError instanceof Error ? networkError.message : 'Unknown error'}`);
    }

    // Create wallet
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`💼 Wallet address: ${wallet.address}`);

    // Check wallet balance
    const balance = await provider.getBalance(wallet.address);
    const balanceEth = ethers.formatEther(balance);
    console.log(`💰 Balance: ${balanceEth} ETH`);

    if (balance === 0n) {
      console.warn('⚠️  Warning: Wallet has zero balance. Transaction will fail due to insufficient gas.');
    }

    // Contract setup - Tinlake uses multiple contracts
    console.log(`\n🔍 Inspecting Tinlake deployment at: ${contractAddress}`);
    
    // The address provided is the ROOT_CONTRACT, but we need the SHELF contract for borrowing
    // Let's try to read the deployment configuration
    const rootAbi = [
      // Root contract might have references to other contracts
      "function shelf() view returns (address)",
      "function pile() view returns (address)", 
      "function reserve() view returns (address)",
      "function lender() view returns (address)",
      
      // If it's actually the shelf contract
      "function borrow(uint256 loan, uint256 amount) external",
      "function withdraw(uint256 loan, uint256 amount, address usr) external",
      "function issue(address registry, uint256 tokenId) external returns (uint256)",
      "function lock(uint256 loan) external",
      
      // View functions
      "function balanceOf(address owner) view returns (uint256)",
      "function loans(uint256 loan) view returns (address, uint256)",
      "function token(uint256 loan) view returns (address, uint256)",
      
      // Pool information
      "function name() view returns (string)",
      "function symbol() view returns (string)"
    ];

    const rootContract = new ethers.Contract(contractAddress, rootAbi, wallet);
    
    // Check if contract exists
    const code = await provider.getCode(contractAddress);
    if (code === '0x') {
      throw new Error(`No contract found at address: ${contractAddress}`);
    }
    console.log(`📋 Contract code found (${code.length} bytes)`);

    // Try to determine what type of contract this is
    let shelfAddress = contractAddress; // Default assumption
    let isRootContract = false;
    
    try {
      // Try to get shelf address from root contract
      const shelf = await rootContract.shelf();
      if (shelf && shelf !== ethers.ZeroAddress) {
        shelfAddress = shelf;
        isRootContract = true;
        console.log(`📍 Root contract detected. Shelf contract: ${shelfAddress}`);
      }
    } catch (e) {
      console.log(`📍 Assuming this is the shelf contract directly`);
    }

    // Try to get basic contract info
    try {
      const name = await rootContract.name().catch(() => null);
      const symbol = await rootContract.symbol().catch(() => null);
      if (name && symbol) {
        console.log(`📝 Contract: ${name} (${symbol})`);
      }
    } catch (e) {
      // Contract might not have these functions
    }

    // Create shelf contract instance
    const shelfAbi = [
      // Main borrowing functions
      "function borrow(uint256 loan, uint256 amount) external",
      "function withdraw(uint256 loan, uint256 amount, address usr) external", 
      "function issue(address registry, uint256 tokenId) external returns (uint256)",
      "function lock(uint256 loan) external",
      "function unlock(uint256 loan) external",
      "function repay(uint256 loan, uint256 amount) external",
      
      // View functions  
      "function loans(uint256 loan) view returns (address, uint256)",
      "function token(uint256 loan) view returns (address, uint256)",
      "function balanceOf(address owner) view returns (uint256)",
      "function nftLocked(uint256 loan) view returns (bool)",
      "function balance() view returns (uint256)",
      
      // Events
      "event Issue(address indexed registry, uint256 indexed tokenId, uint256 loan)",
      "event Borrow(uint256 indexed loan, uint256 amount, address usr)",
      "event Withdraw(uint256 indexed loan, uint256 amount, address usr)"
    ];

    const shelfContract = new ethers.Contract(shelfAddress, shelfAbi, wallet);
    console.log(`✅ Connected to shelf contract: ${shelfAddress}`);

    // Convert amount to wei
    const amountInWei = ethers.parseUnits(amount, 18);
    console.log(`\n📄 Transaction Details:`);
    console.log(`- Pool ID: ${poolId}`);
    console.log(`- Amount: ${amount} tokens`);
    console.log(`- Amount in Wei: ${amountInWei.toString()}`);

    // Tinlake borrowing process explanation
    console.log(`\n💡 Understanding Tinlake Borrowing Process:`);
    console.log(`   Tinlake requires a specific workflow for borrowing:`);
    console.log(`   1. Issue a loan (requires NFT ownership)`);
    console.log(`   2. Lock the collateral NFT`);
    console.log(`   3. Call borrow() with loan ID and amount`);
    console.log(`   4. Call withdraw() to get the funds`);
    console.log(`\n⚠️  Important: This script demonstrates the borrow() call,`);
    console.log(`   but you need an existing loan with locked collateral first.`);
    
    // Since we don't have a real loan setup, let's try to understand what exists
    console.log(`\n🔍 Analyzing existing loans for wallet: ${wallet.address}`);
    
    // Check wallet's loan balance
    try {
      const loanBalance = await shelfContract.balanceOf(wallet.address);
      console.log(`📊 Loan NFTs owned by wallet: ${loanBalance.toString()}`);
      
      if (loanBalance > 0) {
        console.log(`✅ Wallet owns ${loanBalance} loan NFT(s)`);
        // For demo purposes, let's assume loan ID 1 exists
        const loanId = 1;
        
        try {
          const tokenInfo = await shelfContract.token(loanId);
          console.log(`📋 Loan ${loanId} token info:`, tokenInfo);
          
          const isLocked = await shelfContract.nftLocked(loanId);
          console.log(`🔒 Loan ${loanId} NFT locked: ${isLocked}`);
          
          if (isLocked) {
            console.log(`✅ Loan ${loanId} is ready for borrowing`);
            
            // Try to borrow against this loan
            console.log(`\n🎯 Attempting to borrow ${amount} against loan ${loanId}...`);
            
            let gasEstimate: bigint;
            try {
              gasEstimate = await shelfContract.borrow.estimateGas(loanId, amountInWei);
              console.log(`⛽ Gas estimate for borrow(${loanId}, ${amountInWei}): ${gasEstimate}`);
            } catch (gasError) {
              console.warn('⚠️  Could not estimate gas:', gasError.message);
              gasEstimate = 300000n;
            }

            const tx = await shelfContract.borrow(loanId, amountInWei, {
              gasLimit: gasEstimate * 120n / 100n,
            });
            
            console.log(`✅ Borrow transaction submitted: ${tx.hash}`);
            
          } else {
            throw new Error(`Loan ${loanId} NFT is not locked. Cannot borrow against unlocked collateral.`);
          }
          
        } catch (loanError) {
          throw new Error(`Could not access loan ${loanId}: ${loanError.message}`);
        }
        
      } else {
        throw new Error(`Wallet has no loan NFTs. You must first:\n1. Issue a loan with collateral NFT\n2. Lock the collateral\n3. Then borrow against it`);
      }
      
    } catch (balanceError) {
      console.log(`⚠️  Could not check loan balance: ${balanceError.message}`);
      
      // Fallback: Try to borrow against a hypothetical loan ID
      console.log(`\n🎲 Fallback: Attempting to borrow against loan ID ${poolId}...`);
      console.log(`   (This will likely fail if the loan doesn't exist or isn't properly set up)`);
      
      let gasEstimate: bigint = 300000n;
      try {
        gasEstimate = await shelfContract.borrow.estimateGas(poolId, amountInWei);
        console.log(`⛽ Gas estimate: ${gasEstimate}`);
      } catch (gasError) {
        console.warn(`⚠️  Gas estimation failed: ${gasError.message}`);
      }

      const tx = await shelfContract.borrow(poolId, amountInWei, {
        gasLimit: gasEstimate * 120n / 100n,
      });
      
      console.log(`📤 Transaction submitted: ${tx.hash}`);
    }

    console.log(`✅ Transaction submitted!`);
    console.log(`📍 Hash: ${tx.hash}`);
    
    if (CURRENT_NETWORK === 'mainnet') {
      console.log(`🔗 Etherscan: https://etherscan.io/tx/${tx.hash}`);
    }

    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    const receipt = await tx.wait();

    if (receipt && receipt.status === 1) {
      console.log('\n🎉 Transaction confirmed successfully!');
      console.log(`📋 Block number: ${receipt.blockNumber}`);
      console.log(`⛽ Gas used: ${receipt.gasUsed?.toString()}`);
      
      // Calculate transaction cost
      if (receipt.gasUsed && gasPrice.gasPrice) {
        const txCost = receipt.gasUsed * gasPrice.gasPrice;
        console.log(`💸 Transaction cost: ${ethers.formatEther(txCost)} ETH`);
      }

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString()
      };
    } else {
      throw new Error('Transaction failed - status is 0');
    }

  } catch (error) {
    console.error('\n❌ Borrow operation failed:');
    console.error(error instanceof Error ? error.message : error);
    
    // Provide helpful debugging information
    if (error instanceof Error) {
      if (error.message.includes('insufficient funds')) {
        console.error('💡 Solution: Add more ETH to your wallet for gas fees');
      } else if (error.message.includes('execution reverted')) {
        console.error('💡 Solution: Check if the pool exists and you have permission to borrow');
      } else if (error.message.includes('network') || error.message.includes('connection')) {
        console.error('💡 Solution: Check your network connection and RPC URL');
      } else if (error.message.includes('private key')) {
        console.error('💡 Solution: Verify your private key format in the .env file');
      }
    }
    
    throw error;
  }
}

// Main execution function
async function main() {
  try {
    // Configuration
    const poolId = 1;
    const amount = "10";
    
    console.log(`🎯 Configuration:`);
    console.log(`- Network: ${CURRENT_NETWORK}`);
    console.log(`- Pool ID: ${poolId}`);
    console.log(`- Amount: ${amount} tokens`);
    console.log('─'.repeat(50));
    
    const result = await borrow(poolId, amount);
    
    console.log('\n✅ Borrow operation completed successfully!');
    console.log('📊 Result:', result);
    
  } catch (error) {
    console.error('\n💥 Operation failed:', error instanceof Error ? error.message : error);
    
    // Show setup instructions
    console.log('\n📝 Setup Instructions:');
    console.log('1. Create a .env file in your project root with:');
    console.log('   ETHEREUM_ADMIN_PRIVATE_KEY=0x...');
    console.log('   TINLAKE_BORROW_CONTRACT=0x...');
    if (CURRENT_NETWORK === 'mainnet') {
      console.log('   ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY');
    }
    console.log('2. For localhost: Make sure Hardhat node is running (npx hardhat node)');
    console.log(`3. To switch networks: Change CURRENT_NETWORK to '${CURRENT_NETWORK === 'localhost' ? 'mainnet' : 'localhost'}' in the code`);
    
    process.exit(1);
  }
}

// Auto-execute if run directly (works with ts-node and node)
const isMainModule = process.argv[1]?.endsWith('borrow.ts') || process.argv[1]?.endsWith('borrow.js');
if (isMainModule) {
  main().catch(console.error);
}

export default borrow;