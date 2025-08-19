import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

export async function borrow(poolId: number, amount: string) {
  try {
    // Validate inputs
    if (!poolId || poolId < 0) {
      throw new Error('Invalid pool ID provided');
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      throw new Error('Invalid amount provided. Must be a positive number');
    }

    // Validate environment variables
    const rpcUrl = process.env.ETHEREUM_RPC_URL;
    const privateKey = process.env.ETHEREUM_ADMIN_PRIVATE_KEY;
    const contractAddress = process.env.TINLAKE_BORROW_CONTRACT;

    if (!rpcUrl) {
      throw new Error('ETHEREUM_RPC_URL not set in environment variables');
    }

    if (!privateKey) {
      throw new Error('ETHEREUM_ADMIN_PRIVATE_KEY not set in environment variables');
    }

    if (!contractAddress) {
      throw new Error('TINLAKE_BORROW_CONTRACT not set in environment variables');
    }

    // Validate private key format
    if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
      throw new Error('Invalid private key format. Must be 64 hex characters with 0x prefix');
    }

    // Validate contract address format
    if (!ethers.isAddress(contractAddress)) {
      throw new Error('Invalid contract address format');
    }

    console.log('🏦 Initiating borrow transaction...');
    console.log(`📊 Pool ID: ${poolId}`);
    console.log(`💰 Amount: ${amount} tokens`);

    // Initialize provider with error handling
    let provider: ethers.JsonRpcProvider;
    try {
      provider = new ethers.JsonRpcProvider(rpcUrl);
      // Test connection
      await provider.getNetwork();
    } catch (providerError: any) {
      throw new Error(`Failed to connect to Ethereum network: ${providerError.message}`);
    }

    // Initialize wallet with error handling
    let wallet: ethers.Wallet;
    try {
      wallet = new ethers.Wallet(privateKey, provider);
    } catch (walletError: any) {
      throw new Error(`Failed to initialize wallet: ${walletError.message}`);
    }

    // Enhanced Tinlake contract ABI with more comprehensive interface
    const tinlakeBorrowABI = [
      "function borrow(uint256 poolId, uint256 amount) public returns (bool)",
      "function borrowAllowed(address borrower, uint256 poolId, uint256 amount) public view returns (bool)",
      "function getBorrowBalance(address borrower, uint256 poolId) public view returns (uint256)",
      "function getPoolInfo(uint256 poolId) public view returns (uint256 totalBorrowed, uint256 borrowLimit, uint256 interestRate)",
      "event Borrow(address indexed borrower, uint256 indexed poolId, uint256 amount, uint256 timestamp)"
    ];

    // Initialize contract with error handling
    let contract: ethers.Contract;
    try {
      contract = new ethers.Contract(contractAddress, tinlakeBorrowABI, wallet);
    } catch (contractError: any) {
      throw new Error(`Failed to initialize contract: ${contractError.message}`);
    }

    // Check wallet balance for gas fees
    try {
      const balance = await wallet.provider.getBalance(wallet.address);
      const balanceEth = ethers.formatEther(balance);
      console.log(`💳 Wallet balance: ${balanceEth} ETH`);
      
      if (Number(balanceEth) < 0.01) {
        console.warn('⚠️ Low wallet balance. Transaction may fail due to insufficient gas.');
      }
    } catch (balanceError) {
      console.warn('⚠️ Could not check wallet balance');
    }

    // Check if borrowing is allowed (if function exists)
    try {
      const amountWei = ethers.parseUnits(amount, 18);
      const borrowAllowed = await contract.borrowAllowed(wallet.address, poolId, amountWei);
      
      if (!borrowAllowed) {
        throw new Error('Borrowing not allowed for this account/pool/amount combination');
      }
      
      console.log('✅ Borrow pre-check passed');
    } catch (checkError: any) {
      // If borrowAllowed function doesn't exist, continue (some contracts may not have this)
      if (!checkError.message.includes('borrowAllowed')) {
        console.warn('⚠️ Borrow pre-check failed:', checkError.message);
      }
    }

    // Get pool information (if available)
    try {
      const poolInfo = await contract.getPoolInfo(poolId);
      console.log('📋 Pool Information:');
      console.log(`   Total Borrowed: ${ethers.formatUnits(poolInfo.totalBorrowed, 18)}`);
      console.log(`   Borrow Limit: ${ethers.formatUnits(poolInfo.borrowLimit, 18)}`);
      console.log(`   Interest Rate: ${poolInfo.interestRate}%`);
    } catch (poolInfoError) {
      // Pool info function may not exist in all contracts
      console.log('📋 Pool info not available from contract');
    }

    // Estimate gas before transaction
    let gasEstimate: bigint;
    try {
      const amountWei = ethers.parseUnits(amount, 18);
      gasEstimate = await contract.borrow.estimateGas(poolId, amountWei);
      console.log(`⛽ Estimated gas: ${gasEstimate.toString()}`);
    } catch (gasError: any) {
      console.warn('⚠️ Could not estimate gas, using default');
      gasEstimate = BigInt(200000); // Default gas limit
    }

    // Execute borrow transaction
    console.log('🚀 Executing borrow transaction...');
    
    const amountWei = ethers.parseUnits(amount, 18);
    
    const tx = await contract.borrow(poolId, amountWei, {
      gasLimit: gasEstimate + BigInt(50000), // Add buffer to gas estimate
      gasPrice: await provider.getFeeData().then(fees => fees.gasPrice)
    });

    console.log(`📝 Transaction submitted: ${tx.hash}`);
    console.log('⏳ Waiting for confirmation...');

    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    if (receipt?.status === 1) {
      console.log(`✅ Borrow successful!`);
      console.log(`💰 Borrowed: ${amount} tokens from pool ${poolId}`);
      console.log(`🧾 Transaction hash: ${tx.hash}`);
      console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`🔍 Block number: ${receipt.blockNumber}`);
      
      // Try to parse events
      try {
        const borrowEvent = receipt.logs.find(log => {
          try {
            const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
            return parsed?.name === 'Borrow';
          } catch {
            return false;
          }
        });
        
        if (borrowEvent) {
          console.log('📊 Borrow event detected in transaction');
        }
      } catch (eventError) {
        // Event parsing is optional
      }
      
    } else {
      throw new Error('Transaction failed during execution');
    }

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      gasUsed: receipt?.gasUsed.toString(),
      poolId,
      amount,
      borrower: wallet.address
    };

  } catch (error: any) {
    console.error('❌ Borrow transaction failed:', error.message);
    
    // Enhanced error handling with common error patterns
    if (error.message.includes('insufficient funds')) {
      console.error('💸 Insufficient funds for gas fees or borrowing');
    } else if (error.message.includes('execution reverted')) {
      console.error('🚫 Smart contract rejected the transaction');
    } else if (error.message.includes('nonce')) {
      console.error('🔄 Nonce error - try again in a moment');
    } else if (error.message.includes('gas')) {
      console.error('⛽ Gas-related error - transaction may be too complex');
    }
    
    throw error;
  }
}

// Additional utility functions for borrowing operations

export async function getBorrowingCapacity(poolId: number, borrowerAddress?: string): Promise<string> {
  try {
    const rpcUrl = process.env.ETHEREUM_RPC_URL;
    const contractAddress = process.env.TINLAKE_BORROW_CONTRACT;
    
    if (!rpcUrl || !contractAddress) {
      throw new Error('Missing RPC URL or contract address');
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, [
      "function getPoolInfo(uint256 poolId) public view returns (uint256 totalBorrowed, uint256 borrowLimit, uint256 interestRate)",
      "function getBorrowBalance(address borrower, uint256 poolId) public view returns (uint256)"
    ], provider);

    const poolInfo = await contract.getPoolInfo(poolId);
    const borrowLimit = ethers.formatUnits(poolInfo.borrowLimit, 18);
    const totalBorrowed = ethers.formatUnits(poolInfo.totalBorrowed, 18);
    const availableCapacity = (Number(borrowLimit) - Number(totalBorrowed)).toString();

    console.log(`📊 Pool ${poolId} Borrowing Capacity:`);
    console.log(`   Total Limit: ${borrowLimit}`);
    console.log(`   Currently Borrowed: ${totalBorrowed}`);
    console.log(`   Available: ${availableCapacity}`);

    return availableCapacity;

  } catch (error: any) {
    console.error('❌ Failed to get borrowing capacity:', error.message);
    throw error;
  }
}

export async function getCurrentBorrowBalance(poolId: number, borrowerAddress?: string): Promise<string> {
  try {
    const rpcUrl = process.env.ETHEREUM_RPC_URL;
    const contractAddress = process.env.TINLAKE_BORROW_CONTRACT;
    const privateKey = process.env.ETHEREUM_ADMIN_PRIVATE_KEY;
    
    if (!rpcUrl || !contractAddress) {
      throw new Error('Missing RPC URL or contract address');
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Use provided address or default to wallet address
    let addressToCheck = borrowerAddress;
    if (!addressToCheck && privateKey) {
      const wallet = new ethers.Wallet(privateKey);
      addressToCheck = wallet.address;
    }
    
    if (!addressToCheck) {
      throw new Error('No borrower address provided and no wallet configured');
    }

    const contract = new ethers.Contract(contractAddress, [
      "function getBorrowBalance(address borrower, uint256 poolId) public view returns (uint256)"
    ], provider);

    const balance = await contract.getBorrowBalance(addressToCheck, poolId);
    const balanceFormatted = ethers.formatUnits(balance, 18);

    console.log(`💰 Current borrow balance for ${addressToCheck} in pool ${poolId}: ${balanceFormatted}`);
    
    return balanceFormatted;

  } catch (error: any) {
    console.error('❌ Failed to get borrow balance:', error.message);
    throw error;
  }
}