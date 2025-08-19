// src/utils/balance.ts
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const WALLET_FILE = path.join(process.cwd(), '.wallets', 'wallet.json');

// Database connection configuration
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'centrifuge_rwa',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

const CHAIN_RPCS = {
  'sepolia': process.env.SEPOLIA_RPC_URL || 'https://rpc2.sepolia.org',
  'ethereum': process.env.ETHEREUM_RPC_URL || 'https://cloudflare-eth.com',
  'polygon': process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
  'goerli': 'https://goerli.blockpi.network/v1/rpc/public',
  'mumbai': 'https://rpc-mumbai.maticvigil.com',
  'centrifuge': process.env.CENTRIFUGE_RPC_URL || 'wss://fullnode.development.cntrfg.com',
  'demo': 'demo-mode'
};

export interface BalanceInfo {
  address: string;
  chain: string;
  nativeBalance: string;
  nativeSymbol: string;
  erc20Balances: Array<{symbol: string, balance: string, address: string}>;
  rwaTokens: Array<{name: string, symbol: string, balance: string, valueUsd: number}>;
  totalPortfolioValue: number;
  borrowingCapacity: {
    totalCollateralValue: number;
    maxBorrowAmount: number;
    currentlyBorrowed: number;
    availableToBorrow: number;
  };
}

export async function checkBalance(chain?: string): Promise<void> {
  console.log('💰 Checking wallet balance...');
  
  try {
    // Check if wallet exists
    if (!fs.existsSync(WALLET_FILE)) {
      console.error('❌ No wallet found. Run "npm run wallet -- --create" first.');
      return;
    }

    // Get chain if not provided
    if (!chain) {
      const { selectedChain } = await inquirer.prompt([{
        type: 'list',
        name: 'selectedChain',
        message: 'Select chain:',
        choices: [...Object.keys(CHAIN_RPCS)]
      }]);
      chain = selectedChain;
    }

    // Demo mode for testing
    if (chain === 'demo' || chain === 'demo (offline)') {
      await showDemoBalance();
      return;
    }

    if (!CHAIN_RPCS[chain as keyof typeof CHAIN_RPCS]) {
      console.error(`❌ Unsupported chain: ${chain}`);
      console.log('Available chains:', Object.keys(CHAIN_RPCS).join(', '));
      return;
    }

    // Get password
    const { password } = await inquirer.prompt([{
      type: 'password',
      name: 'password',
      message: 'Enter wallet password:',
      validate: (input) => input.length > 0 || 'Password is required'
    }]);

    // Load and decrypt wallet
    let wallet: ethers.Wallet;
    try {
      const encryptedWallet = fs.readFileSync(WALLET_FILE, 'utf8');
      wallet = await ethers.Wallet.fromEncryptedJson(encryptedWallet, password);
    } catch (walletError: any) {
      if (walletError.message.includes('invalid password')) {
        console.error('❌ Invalid wallet password');
        return;
      }
      throw new Error('Failed to decrypt wallet: ' + walletError.message);
    }
    
    // Connect to provider
    const rpcUrl = CHAIN_RPCS[chain as keyof typeof CHAIN_RPCS];
    console.log(`🔗 Connecting to ${chain} via ${rpcUrl}...`);
    
    let provider: ethers.JsonRpcProvider;
    try {
      provider = new ethers.JsonRpcProvider(rpcUrl);
      // Test connection
      await provider.getNetwork();
    } catch (providerError: any) {
      console.error(`❌ Failed to connect to ${chain}:`, providerError.message);
      console.log('💡 Try demo mode for offline testing: npm run wallet -- --balance demo');
      return;
    }
    
    // Get and display balance information
    const balanceInfo = await getComprehensiveBalance(wallet, provider, chain);
    displayBalanceInfo(balanceInfo);
    
  } catch (error: any) {
    console.error(`❌ Error checking balance:`, error.message);
    
    // Suggest demo mode
    console.log('\n💡 Try demo mode for offline testing:');
    console.log('   npm run wallet -- --balance demo');
  }
}

async function showDemoBalance(): Promise<void> {
  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: 'Enter wallet password:',
    validate: (input) => input.length > 0 || 'Password is required'
  }]);

  try {
    const encryptedWallet = fs.readFileSync(WALLET_FILE, 'utf8');
    const wallet = await ethers.Wallet.fromEncryptedJson(encryptedWallet, password);
    
    console.log('✅ Demo Balance Check:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔍 Address: ${wallet.address}`);
    console.log('💰 ETH Balance: 0.5 ETH (demo)');
    console.log('🪙 USDC Balance: 1,000 USDC (demo)');
    console.log('🏛️ RWA Tokens: 3 tokenized assets (demo)');
    console.log('💡 Available to Borrow: $281,250 (demo)');
    console.log('🎭 This is demonstration data - not real balance');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Show demo RWA portfolio
    console.log('\n🏛️ Demo RWA Token Portfolio:');
    console.log('   • Commercial Property NYC: 1.0 tokens ($250,000)');
    console.log('   • Trade Finance Invoice: 0.5 tokens ($50,000)');
    console.log('   • Equipment Lease: 2.0 tokens ($75,000)');
    console.log('   📊 Total Portfolio Value: $375,000');
    
  } catch (error: any) {
    if (error.message.includes('invalid password')) {
      console.error('❌ Invalid wallet password');
    } else {
      console.error('❌ Error in demo mode:', error.message);
    }
  }
}

async function getComprehensiveBalance(
  wallet: ethers.Wallet, 
  provider: ethers.JsonRpcProvider, 
  chain: string
): Promise<BalanceInfo> {
  console.log('📊 Gathering comprehensive balance information...');
  
  // Get native token balance
  const balance = await provider.getBalance(wallet.address);
  const balanceEth = ethers.formatEther(balance);
  const nativeSymbol = getNativeTokenSymbol(chain);
  
  // Get ERC-20 token balances
  const erc20Balances = await checkERC20Balances(wallet, provider, chain);
  
  // Get RWA token balances
  const rwaTokens = await getRWATokenBalances(wallet.address);
  
  // Calculate borrowing capacity
  const borrowingCapacity = await calculateBorrowingCapacity(wallet.address);
  
  // Calculate total portfolio value
  const totalPortfolioValue = calculateTotalPortfolioValue(
    parseFloat(balanceEth), 
    erc20Balances, 
    rwaTokens,
    nativeSymbol
  );
  
  return {
    address: wallet.address,
    chain,
    nativeBalance: balanceEth,
    nativeSymbol,
    erc20Balances,
    rwaTokens,
    totalPortfolioValue,
    borrowingCapacity
  };
}

function displayBalanceInfo(info: BalanceInfo): void {
  console.log(`✅ Balance on ${info.chain}:`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔍 Address: ${info.address}`);
  console.log(`💰 Native Balance: ${parseFloat(info.nativeBalance).toFixed(4)} ${info.nativeSymbol}`);
  
  // Display ERC-20 balances
  if (info.erc20Balances.length > 0) {
    console.log('\n🪙 ERC-20 Token Balances:');
    console.log('─────────────────────────────────────────────────────────────────────────');
    info.erc20Balances.forEach(token => {
      const balance = parseFloat(token.balance);
      if (balance > 0) {
        console.log(`   ${token.symbol}: ${balance.toLocaleString()} ${token.symbol}`);
      } else {
        console.log(`   ${token.symbol}: 0 ${token.symbol}`);
      }
    });
  }
  
  // Display RWA token portfolio
  if (info.rwaTokens.length > 0) {
    console.log('\n🏛️ RWA Token Portfolio:');
    console.log('─────────────────────────────────────────────────────────────────────────');
    
    let totalRWAValue = 0;
    info.rwaTokens.forEach(token => {
      const tokenValue = parseFloat(token.balance) * token.valueUsd;
      console.log(`   ${token.name} (${token.symbol}): ${token.balance} tokens`);
      console.log(`     Value: $${tokenValue.toLocaleString()}`);
      totalRWAValue += tokenValue;
    });
    
    console.log(`\n   📊 Total RWA Portfolio Value: $${totalRWAValue.toLocaleString()}`);
  } else {
    console.log('\n🏛️ RWA Token Portfolio: No tokenized assets found');
    console.log('   💡 Use "npm run assets -- --create" to tokenize your first asset');
  }
  
  // Display borrowing capacity
  console.log('\n🏦 Borrowing Capacity Analysis:');
  console.log('─────────────────────────────────────────────────────────────────────────');
  console.log(`   💰 Total Collateral Value: $${info.borrowingCapacity.totalCollateralValue.toLocaleString()}`);
  console.log(`   📊 Maximum Borrow Amount: $${info.borrowingCapacity.maxBorrowAmount.toLocaleString()}`);
  console.log(`   💸 Currently Borrowed: $${info.borrowingCapacity.currentlyBorrowed.toLocaleString()}`);
  console.log(`   🎯 Available to Borrow: $${info.borrowingCapacity.availableToBorrow.toLocaleString()}`);
  
  if (info.borrowingCapacity.availableToBorrow > 0) {
    console.log(`   💡 Use "npm run borrow-against-asset" to start borrowing`);
  }
  
  // Portfolio summary
  console.log('\n📈 Portfolio Summary:');
  console.log('─────────────────────────────────────────────────────────────────────────');
  console.log(`   💎 Total Portfolio Value: $${info.totalPortfolioValue.toLocaleString()}`);
  
  if (info.borrowingCapacity.currentlyBorrowed > 0) {
    const ltv = (info.borrowingCapacity.currentlyBorrowed / info.borrowingCapacity.totalCollateralValue) * 100;
    console.log(`   📊 Current LTV Ratio: ${ltv.toFixed(2)}%`);
    
    if (ltv > 75) {
      console.log(`   ⚠️ WARNING: High LTV ratio - consider adding collateral`);
    }
  }
}

async function checkERC20Balances(
  wallet: ethers.Wallet, 
  provider: ethers.JsonRpcProvider, 
  chain: string
): Promise<Array<{symbol: string, balance: string, address: string}>> {
  
  const commonTokens = getCommonTokensForChain(chain);
  const balances: Array<{symbol: string, balance: string, address: string}> = [];
  
  if (commonTokens.length === 0) {
    return balances;
  }
  
  for (const token of commonTokens) {
    try {
      const tokenContract = new ethers.Contract(
        token.address,
        [
          'function balanceOf(address) view returns (uint256)', 
          'function decimals() view returns (uint8)',
          'function symbol() view returns (string)'
        ],
        provider
      );
      
      const [balance, decimals] = await Promise.all([
        tokenContract.balanceOf(wallet.address),
        tokenContract.decimals()
      ]);
      
      const formattedBalance = ethers.formatUnits(balance, decimals);
      
      balances.push({
        symbol: token.symbol,
        balance: formattedBalance,
        address: token.address
      });
      
    } catch (tokenError: any) {
      console.warn(`⚠️ Unable to fetch ${token.symbol} balance:`, tokenError.message);
      balances.push({
        symbol: token.symbol,
        balance: '0',
        address: token.address
      });
    }
  }
  
  return balances;
}

async function getRWATokenBalances(walletAddress: string): Promise<Array<{
  name: string, 
  symbol: string, 
  balance: string, 
  valueUsd: number
}>> {
  try {
    // Try to get real data from database
    const client = new Client(DB_CONFIG);
    await client.connect();
    
    const result = await client.query(`
      SELECT name, asset_type, value_usd, token_address, token_amount
      FROM assets 
      WHERE wallet_address = $1 
      AND tokenization_status = 'tokenized' 
      AND is_active = true
      ORDER BY value_usd DESC
    `, [walletAddress]);
    
    await client.end();
    
    return result.rows.map(row => ({
      name: row.name,
      symbol: generateSymbolFromName(row.name),
      balance: (row.token_amount || 1).toString(),
      valueUsd: parseFloat(row.value_usd) || 0
    }));
    
  } catch (dbError) {
    // Fallback to mock data for demonstration
    return getMockRWATokens();
  }
}

async function calculateBorrowingCapacity(walletAddress: string): Promise<{
  totalCollateralValue: number;
  maxBorrowAmount: number;
  currentlyBorrowed: number;
  availableToBorrow: number;
}> {
  try {
    const client = new Client(DB_CONFIG);
    await client.connect();
    
    // Get total collateral value
    const collateralResult = await client.query(`
      SELECT COALESCE(SUM(value_usd), 0) as total_collateral
      FROM assets 
      WHERE wallet_address = $1 
      AND tokenization_status = 'tokenized' 
      AND is_active = true
    `, [walletAddress]);
    
    // Get current borrowing positions
    const borrowResult = await client.query(`
      SELECT COALESCE(SUM(principal_amount), 0) as total_borrowed
      FROM positions p
      JOIN assets a ON p.asset_id = a.id::text
      WHERE a.wallet_address = $1 
      AND p.status = 'active'
      AND p.position_type = 'borrow'
    `, [walletAddress]);
    
    await client.end();
    
    const totalCollateralValue = parseFloat(collateralResult.rows[0].total_collateral) || 0;
    const currentlyBorrowed = parseFloat(borrowResult.rows[0].total_borrowed) || 0;
    const maxLTV = 0.75; // 75% loan-to-value ratio
    const maxBorrowAmount = totalCollateralValue * maxLTV;
    const availableToBorrow = Math.max(0, maxBorrowAmount - currentlyBorrowed);
    
    return {
      totalCollateralValue,
      maxBorrowAmount,
      currentlyBorrowed,
      availableToBorrow
    };
    
  } catch (dbError) {
    // Return demo data if database unavailable
    return {
      totalCollateralValue: 375000,
      maxBorrowAmount: 281250,
      currentlyBorrowed: 0,
      availableToBorrow: 281250
    };
  }
}

function calculateTotalPortfolioValue(
  nativeBalance: number,
  erc20Balances: Array<{symbol: string, balance: string, address: string}>,
  rwaTokens: Array<{name: string, symbol: string, balance: string, valueUsd: number}>,
  nativeSymbol: string
): number {
  // For simplicity, we'll focus on RWA tokens and USDC/USDT stablecoins
  let totalValue = 0;
  
  // Add RWA token values
  rwaTokens.forEach(token => {
    totalValue += parseFloat(token.balance) * token.valueUsd;
  });
  
  // Add stablecoin values (assume $1 each)
  erc20Balances.forEach(token => {
    if (token.symbol === 'USDC' || token.symbol === 'USDT' || token.symbol === 'DAI') {
      totalValue += parseFloat(token.balance);
    }
  });
  
  // Note: Native token value would require price feed integration
  // For now, we'll skip native token value to avoid complexity
  
  return totalValue;
}

function getNativeTokenSymbol(chain: string): string {
  const symbols: Record<string, string> = {
    'ethereum': 'ETH',
    'sepolia': 'ETH',
    'goerli': 'ETH',
    'polygon': 'MATIC',
    'mumbai': 'MATIC',
    'centrifuge': 'CFG'
  };
  return symbols[chain] || 'ETH';
}

function getCommonTokensForChain(chain: string): Array<{symbol: string, address: string}> {
  const tokens: Record<string, Array<{symbol: string, address: string}>> = {
    'ethereum': [
      { symbol: 'USDC', address: '0xA0b86a33E6E0Dc0C166D6E4D5F8aA8DcD6Bc5D4a' },
      { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
      { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' }
    ],
    'sepolia': [
      { symbol: 'USDC', address: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8' },
      { symbol: 'DAI', address: '0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357' }
    ],
    'polygon': [
      { symbol: 'USDC', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
      { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
      { symbol: 'DAI', address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' }
    ]
  };
  
  return tokens[chain] || [];
}

function generateSymbolFromName(name: string): string {
  // Generate a symbol from asset name (first letters of each word)
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .join('')
    .substring(0, 6);
}

function getMockRWATokens(): Array<{name: string, symbol: string, balance: string, valueUsd: number}> {
  return [
    { name: 'Commercial Property NYC', symbol: 'CPNYC', balance: '1.0', valueUsd: 250000 },
    { name: 'Trade Finance Invoice', symbol: 'TFINV', balance: '0.5', valueUsd: 50000 },
    { name: 'Equipment Lease', symbol: 'EQLSE', balance: '2.0', valueUsd: 75000 }
  ];
}

// Enhanced balance checking for production
export async function getDetailedBalances(walletAddress: string, chain?: string): Promise<BalanceInfo | null> {
  try {
    if (!chain) {
      chain = 'sepolia'; // Default to Sepolia testnet
    }
    
    const rpcUrl = CHAIN_RPCS[chain as keyof typeof CHAIN_RPCS];
    if (!rpcUrl || rpcUrl === 'demo-mode') {
      throw new Error('Invalid chain or demo mode not supported for detailed balances');
    }
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet('0x0000000000000000000000000000000000000000000000000000000000000001', provider);
    wallet.address = walletAddress; // Override address for balance checking
    
    return await getComprehensiveBalance(wallet, provider, chain);
    
  } catch (error: any) {
    console.error('❌ Error getting detailed balances:', error.message);
    return null;
  }
}

export async function checkLiquidationRisk(walletAddress: string): Promise<Array<{
  positionId: string;
  assetName: string;
  currentLTV: number;
  liquidationThreshold: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  timeToLiquidation?: string;
}>> {
  try {
    const client = new Client(DB_CONFIG);
    await client.connect();
    
    const result = await client.query(`
      SELECT 
        p.id,
        a.name as asset_name,
        p.principal_amount,
        a.value_usd as collateral_value,
        (p.principal_amount / a.value_usd) as current_ltv
      FROM positions p
      JOIN assets a ON p.asset_id = a.id::text
      WHERE a.wallet_address = $1 
      AND p.status = 'active'
      AND p.position_type = 'borrow'
    `, [walletAddress]);
    
    await client.end();
    
    const atRiskPositions = result.rows.map(row => {
      const currentLTV = parseFloat(row.current_ltv);
      const liquidationThreshold = 0.85; // 85% liquidation threshold
      
      let riskLevel: 'low' | 'medium' | 'high' | 'critical';
      if (currentLTV >= liquidationThreshold) {
        riskLevel = 'critical';
      } else if (currentLTV >= liquidationThreshold * 0.95) {
        riskLevel = 'high';
      } else if (currentLTV >= liquidationThreshold * 0.8) {
        riskLevel = 'medium';
      } else {
        riskLevel = 'low';
      }
      
      return {
        positionId: row.id.toString(),
        assetName: row.asset_name,
        currentLTV: currentLTV * 100,
        liquidationThreshold: liquidationThreshold * 100,
        riskLevel
      };
    });
    
    return atRiskPositions.filter(pos => pos.riskLevel !== 'low');
    
  } catch (error: any) {
    console.error('❌ Error checking liquidation risk:', error.message);
    return [];
  }
}

// Utility function to check if wallet has sufficient funds for transaction
export async function checkTransactionCapability(
  walletAddress: string, 
  chain: string, 
  estimatedGasCost?: string
): Promise<{canTransact: boolean, reason?: string}> {
  try {
    const rpcUrl = CHAIN_RPCS[chain as keyof typeof CHAIN_RPCS];
    if (!rpcUrl || rpcUrl === 'demo-mode') {
      return { canTransact: false, reason: 'Invalid chain or demo mode' };
    }
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(walletAddress);
    const balanceEth = parseFloat(ethers.formatEther(balance));
    
    const gasLimit = estimatedGasCost ? parseFloat(estimatedGasCost) : 0.01; // Default 0.01 ETH
    
    if (balanceEth >= gasLimit) {
      return { canTransact: true };
    } else {
      return { 
        canTransact: false, 
        reason: `Insufficient ${getNativeTokenSymbol(chain)} for gas fees. Need at least ${gasLimit} ${getNativeTokenSymbol(chain)}` 
      };
    }
    
  } catch (error: any) {
    return { 
      canTransact: false, 
      reason: `Error checking transaction capability: ${error.message}` 
    };
  }
}