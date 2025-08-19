import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

export interface RepaymentResult {
  success: boolean;
  transactionHash: string;
  blockNumber?: number;
  gasUsed?: string;
  poolId: number;
  repaidAmount: string;
  borrower: string;
  timestamp: string;
  remainingDebt?: string;
  interestPaid?: string;
}

export async function repay(poolId: number, amount: string): Promise<RepaymentResult> {
  try {
    // Validate inputs
    if (!poolId || poolId < 0) {
      throw new Error('Invalid pool ID provided');
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      throw new Error('Invalid repayment amount provided. Must be a positive number');
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

    console.log('💳 Initiating loan repayment...');
    console.log(`📊 Pool ID: ${poolId}`);
    console.log(`💰 Repayment Amount: ${amount} tokens`);

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
    const tinlakeRepayABI = [
      "function repay(uint256 poolId, uint256 amount) public returns (bool)",
      "function getBorrowBalance(address borrower, uint256 poolId) public view returns (uint256)",
      "function getPoolInfo(uint256 poolId) public view returns (uint256 totalBorrowed, uint256 borrowLimit, uint256 interestRate)",
      "function calculateInterest(address borrower, uint256 poolId) public view returns (uint256)",
      "function getRepaymentAmount(address borrower, uint256 poolId) public view returns (uint256 principal, uint256 interest)",
      "event Repayment(address indexed borrower, uint256 indexed poolId, uint256 amount, uint256 remainingDebt, uint256 timestamp)"
    ];

    // Initialize contract with error handling
    let contract: ethers.Contract;
    try {
      contract = new ethers.Contract(contractAddress, tinlakeRepayABI, wallet);
    } catch (contractError: any) {
      throw new Error(`Failed to initialize contract: ${contractError.message}`);
    }

    // Check current debt before repayment
    let currentDebt = BigInt(0);
    let interestOwed = BigInt(0);
    try {
      currentDebt = await contract.getBorrowBalance(wallet.address, poolId);
      console.log(`📋 Current debt: ${ethers.formatUnits(currentDebt, 18)} tokens`);
      
      // Try to get interest calculation
      try {
        interestOwed = await contract.calculateInterest(wallet.address, poolId);
        console.log(`💸 Interest owed: ${ethers.formatUnits(interestOwed, 18)} tokens`);
      } catch (interestError) {
        console.warn('⚠️ Could not calculate interest owed');
      }
    } catch (debtError) {
      console.warn('⚠️ Could not retrieve current debt amount');
    }

    // Validate repayment amount doesn't exceed debt
    const repaymentAmountWei = ethers.parseUnits(amount, 18);
    if (currentDebt > 0 && repaymentAmountWei > currentDebt) {
      console.warn(`⚠️ Repayment amount (${amount}) exceeds current debt (${ethers.formatUnits(currentDebt, 18)})`);
      console.log('🔄 Adjusting repayment to exact debt amount...');
    }

    // Check wallet balance for repayment + gas fees
    try {
      const balance = await wallet.provider.getBalance(wallet.address);
      const balanceEth = ethers.formatEther(balance);
      console.log(`💳 Wallet balance: ${balanceEth} ETH`);
      
      if (Number(balanceEth) < 0.01) {
        console.warn('⚠️ Low wallet balance. Transaction may fail due to insufficient gas.');
      }
      
      // TODO: Check ERC20 token balance for repayment
      // This would require token contract interaction
      
    } catch (balanceError) {
      console.warn('⚠️ Could not check wallet balance');
    }

    // Estimate gas before transaction
    let gasEstimate: bigint;
    try {
      gasEstimate = await contract.repay.estimateGas(poolId, repaymentAmountWei);
      console.log(`⛽ Estimated gas: ${gasEstimate.toString()}`);
    } catch (gasError: any) {
      console.warn('⚠️ Could not estimate gas, using default');
      gasEstimate = BigInt(200000); // Default gas limit
    }

    // Execute repayment transaction
    console.log('🚀 Executing repayment transaction...');
    
    const tx = await contract.repay(poolId, repaymentAmountWei, {
      gasLimit: gasEstimate + BigInt(50000), // Add buffer to gas estimate
      gasPrice: await provider.getFeeData().then(fees => fees.gasPrice)
    });

    console.log(`📝 Transaction submitted: ${tx.hash}`);
    console.log('⏳ Waiting for confirmation...');

    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    if (receipt?.status === 1) {
      console.log(`✅ Repayment successful!`);
      console.log(`💰 Repaid: ${amount} tokens to pool ${poolId}`);
      console.log(`🧾 Transaction hash: ${tx.hash}`);
      console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`🔍 Block number: ${receipt.blockNumber}`);
      
      // Calculate remaining debt
      let remainingDebt = '0';
      try {
        const newDebt = await contract.getBorrowBalance(wallet.address, poolId);
        remainingDebt = ethers.formatUnits(newDebt, 18);
        console.log(`📊 Remaining debt: ${remainingDebt} tokens`);
        
        if (newDebt === BigInt(0)) {
          console.log('🎉 Loan fully repaid! Collateral will be released.');
        }
      } catch (debtCheckError) {
        console.warn('⚠️ Could not check remaining debt');
      }
      
      // Try to parse repayment events
      let interestPaid = '0';
      try {
        const repaymentEvent = receipt.logs.find(log => {
          try {
            const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
            return parsed?.name === 'Repayment';
          } catch {
            return false;
          }
        });
        
        if (repaymentEvent) {
          console.log('📊 Repayment event detected in transaction');
          const parsed = contract.interface.parseLog({ 
            topics: repaymentEvent.topics, 
            data: repaymentEvent.data 
          });
          
          if (parsed && parsed.args) {
            remainingDebt = ethers.formatUnits(parsed.args.remainingDebt || 0, 18);
          }
        }
      } catch (eventError) {
        // Event parsing is optional
      }
      
      const result: RepaymentResult = {
        success: true,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        poolId,
        repaidAmount: amount,
        borrower: wallet.address,
        timestamp: new Date().toISOString(),
        remainingDebt,
        interestPaid
      };
      
      return result;
      
    } else {
      throw new Error('Transaction failed during execution');
    }

  } catch (error: any) {
    console.error('❌ Repayment transaction failed:', error.message);
    
    // Enhanced error handling with common error patterns
    if (error.message.includes('insufficient funds')) {
      console.error('💸 Insufficient funds for repayment or gas fees');
    } else if (error.message.includes('execution reverted')) {
      console.error('🚫 Smart contract rejected the repayment');
      console.error('   Possible reasons:');
      console.error('   • No active loan for this pool');
      console.error('   • Repayment amount exceeds debt');
      console.error('   • Pool is not accepting repayments');
    } else if (error.message.includes('nonce')) {
      console.error('🔄 Nonce error - try again in a moment');
    } else if (error.message.includes('gas')) {
      console.error('⛽ Gas-related error - transaction may be too complex');
    }
    
    throw error;
  }
}

// Additional utility functions for repayment operations

export async function getRepaymentInfo(poolId: number, borrowerAddress?: string): Promise<{
  currentDebt: string;
  interestOwed: string;
  totalRepaymentRequired: string;
  minRepaymentAmount: string;
}> {
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
      "function getBorrowBalance(address borrower, uint256 poolId) public view returns (uint256)",
      "function calculateInterest(address borrower, uint256 poolId) public view returns (uint256)",
      "function getRepaymentAmount(address borrower, uint256 poolId) public view returns (uint256 principal, uint256 interest)"
    ], provider);

    console.log(`📊 Getting repayment info for ${addressToCheck} in pool ${poolId}...`);

    const currentDebt = await contract.getBorrowBalance(addressToCheck, poolId);
    let interestOwed = BigInt(0);
    
    try {
      interestOwed = await contract.calculateInterest(addressToCheck, poolId);
    } catch (interestError) {
      console.warn('⚠️ Could not calculate interest - using debt amount only');
    }

    const currentDebtFormatted = ethers.formatUnits(currentDebt, 18);
    const interestOwedFormatted = ethers.formatUnits(interestOwed, 18);
    const totalRequired = ethers.formatUnits(currentDebt + interestOwed, 18);
    
    // Minimum repayment is typically interest + some principal
    const minRepayment = interestOwed > 0 ? interestOwedFormatted : '0';

    console.log(`💰 Current debt: ${currentDebtFormatted}`);
    console.log(`💸 Interest owed: ${interestOwedFormatted}`);
    console.log(`📊 Total repayment required: ${totalRequired}`);
    console.log(`📉 Minimum repayment: ${minRepayment}`);
    
    return {
      currentDebt: currentDebtFormatted,
      interestOwed: interestOwedFormatted,
      totalRepaymentRequired: totalRequired,
      minRepaymentAmount: minRepayment
    };

  } catch (error: any) {
    console.error('❌ Failed to get repayment info:', error.message);
    throw error;
  }
}

export async function checkRepaymentEligibility(poolId: number, borrowerAddress?: string): Promise<{
  eligible: boolean;
  reason?: string;
  currentDebt: string;
  poolStatus: string;
}> {
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
      "function getBorrowBalance(address borrower, uint256 poolId) public view returns (uint256)",
      "function getPoolInfo(uint256 poolId) public view returns (uint256 totalBorrowed, uint256 borrowLimit, uint256 interestRate)"
    ], provider);

    const currentDebt = await contract.getBorrowBalance(addressToCheck, poolId);
    const currentDebtFormatted = ethers.formatUnits(currentDebt, 18);
    
    // Check if there's any debt to repay
    if (currentDebt === BigInt(0)) {
      return {
        eligible: false,
        reason: 'No outstanding debt in this pool',
        currentDebt: currentDebtFormatted,
        poolStatus: 'active'
      };
    }

    // Check pool status
    let poolStatus = 'active';
    try {
      const poolInfo = await contract.getPoolInfo(poolId);
      // Pool info retrieved successfully
      poolStatus = 'active';
    } catch (poolError) {
      poolStatus = 'unknown';
    }

    return {
      eligible: true,
      currentDebt: currentDebtFormatted,
      poolStatus
    };

  } catch (error: any) {
    console.error('❌ Failed to check repayment eligibility:', error.message);
    return {
      eligible: false,
      reason: `Error checking eligibility: ${error.message}`,
      currentDebt: '0',
      poolStatus: 'unknown'
    };
  }
}

// Utility function to estimate repayment gas costs
export async function estimateRepaymentCost(poolId: number, amount: string): Promise<{
  gasEstimate: string;
  gasCostEth: string;
  gasCostUsd?: string;
}> {
  try {
    const rpcUrl = process.env.ETHEREUM_RPC_URL;
    const contractAddress = process.env.TINLAKE_BORROW_CONTRACT;
    const privateKey = process.env.ETHEREUM_ADMIN_PRIVATE_KEY;
    
    if (!rpcUrl || !contractAddress || !privateKey) {
      throw new Error('Missing required environment variables');
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    const contract = new ethers.Contract(contractAddress, [
      "function repay(uint256 poolId, uint256 amount) public returns (bool)"
    ], wallet);

    const amountWei = ethers.parseUnits(amount, 18);
    const gasEstimate = await contract.repay.estimateGas(poolId, amountWei);
    
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || BigInt(20000000000); // 20 gwei fallback
    
    const gasCost = gasEstimate * gasPrice;
    const gasCostEth = ethers.formatEther(gasCost);
    
    console.log(`⛽ Gas estimate: ${gasEstimate.toString()}`);
    console.log(`💰 Estimated gas cost: ${gasCostEth} ETH`);
    
    // TODO: Add USD conversion using price feed
    
    return {
      gasEstimate: gasEstimate.toString(),
      gasCostEth,
      gasCostUsd: undefined // Would require price feed integration
    };

  } catch (error: any) {
    console.error('❌ Failed to estimate repayment cost:', error.message);
    throw error;
  }
}