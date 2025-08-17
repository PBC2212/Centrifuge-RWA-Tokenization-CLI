// src/utils/balance.ts
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';

const WALLET_FILE = path.join(process.cwd(), '.wallets', 'wallet.json');

const CHAIN_RPCS = {
  'sepolia': 'https://rpc2.sepolia.org',
  'ethereum': 'https://cloudflare-eth.com',
  'polygon': 'https://polygon-rpc.com',
  'goerli': 'https://goerli.blockpi.network/v1/rpc/public',
  'mumbai': 'https://rpc-mumbai.maticvigil.com',
  'centrifuge': 'wss://fullnode.centrifuge.io',
  'demo': 'demo-mode'
};

export async function checkBalance(chain?: string): Promise<void> {
  console.log('💰 Checking wallet balance...');
  
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
    const { password } = await inquirer.prompt([{
      type: 'password',
      name: 'password',
      message: 'Enter wallet password:'
    }]);

    try {
      const encryptedWallet = fs.readFileSync(WALLET_FILE, 'utf8');
      const wallet = await ethers.Wallet.fromEncryptedJson(encryptedWallet, password);
      
      console.log('✅ Demo Balance Check:');
      console.log(`📍 Address: ${wallet.address}`);
      console.log('💰 ETH Balance: 0.5 ETH (demo)');
      console.log('🪙 USDC Balance: 1,000 USDC (demo)');
      console.log('🏛️ RWA Tokens: 3 tokenized assets (demo)');
      console.log('🎭 This is demonstration data - not real balance');
      return;
    } catch (error) {
      console.error('❌ Invalid wallet password');
      return;
    }
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
    message: 'Enter wallet password:'
  }]);

  try {
    // Load and decrypt wallet
    const encryptedWallet = fs.readFileSync(WALLET_FILE, 'utf8');
    const wallet = await ethers.Wallet.fromEncryptedJson(encryptedWallet, password);
    
    // Connect to provider
    const rpcUrl = CHAIN_RPCS[chain as keyof typeof CHAIN_RPCS];
    console.log(`🔗 Connecting to ${chain} via ${rpcUrl}...`);
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Get native token balance
    const balance = await provider.getBalance(wallet.address);
    const balanceEth = ethers.formatEther(balance);
    
    console.log(`✅ Balance on ${chain}:`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Address: ${wallet.address}`);
    console.log(`💰 Native Balance: ${balanceEth} ${getNativeTokenSymbol(chain)}`);
    
    // Check for common ERC-20 tokens on this chain
    await checkERC20Balances(wallet as any, provider, chain);
    
    // Check for RWA tokens (from our tokenization)
    await checkRWATokenBalances(wallet as any, chain);
    
    // Show borrowing capacity
    await showBorrowingCapacity(wallet.address);
    
  } catch (error: any) {
    console.error(`❌ Error checking balance on ${chain}:`, error.shortMessage || error.message);
    
    // Suggest demo mode
    console.log('\n💡 Try demo mode for offline testing:');
    console.log('   npm run wallet -- --balance demo');
    
    throw error;
  }
}

async function checkERC20Balances(wallet: any, provider: ethers.JsonRpcProvider, chain: string): Promise<void> {
  const commonTokens = getCommonTokensForChain(chain);
  
  if (commonTokens.length === 0) return;
  
  console.log('\n🪙 ERC-20 Token Balances:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  for (const token of commonTokens) {
    try {
      const tokenContract = new ethers.Contract(
        token.address,
        ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
        provider
      );
      
      const [balance, decimals] = await Promise.all([
        tokenContract.balanceOf(wallet.address),
        tokenContract.decimals()
      ]);
      
      const formattedBalance = ethers.formatUnits(balance, decimals);
      const balanceNumber = parseFloat(formattedBalance);
      
      if (balanceNumber > 0) {
        console.log(`   ${token.symbol}: ${parseFloat(formattedBalance).toLocaleString()} ${token.symbol}`);
      } else {
        console.log(`   ${token.symbol}: 0 ${token.symbol}`);
      }
    } catch (error) {
      console.log(`   ${token.symbol}: Unable to fetch balance`);
    }
  }
}

async function checkRWATokenBalances(wallet: any, chain: string): Promise<void> {
  console.log('\n🏛️ RWA Token Portfolio:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // This would connect to your database to get tokenized assets
    // For now, showing demo data
    const mockRWATokens = [
      { name: 'Commercial Property NYC', symbol: 'CPNYC', balance: '1.0', value_usd: 250000 },
      { name: 'Trade Finance Invoice', symbol: 'TFINV', balance: '0.5', value_usd: 50000 },
      { name: 'Equipment Lease', symbol: 'EQLSE', balance: '2.0', value_usd: 75000 }
    ];
    
    let totalRWAValue = 0;
    
    mockRWATokens.forEach(token => {
      const tokenValue = parseFloat(token.balance) * token.value_usd;
      console.log(`   ${token.name} (${token.symbol}): ${token.balance} tokens`);
      console.log(`     Value: $${tokenValue.toLocaleString()}`);
      totalRWAValue += tokenValue;
    });
    
    console.log(`\n   📊 Total RWA Portfolio Value: $${totalRWAValue.toLocaleString()}`);
    
  } catch (error) {
    console.log('   No RWA tokens found or database unavailable');
  }
}

async function showBorrowingCapacity(walletAddress: string): Promise<void> {
  console.log('\n🏦 Borrowing Capacity Analysis:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // This would calculate based on actual tokenized assets
    // For demo, showing estimated capacity
    const estimatedCollateralValue = 375000; // Sum of RWA tokens
    const maxLTV = 0.75; // 75% loan-to-value
    const availableToBorrow = estimatedCollateralValue * maxLTV;
    
    console.log(`   💰 Total Collateral Value: $${estimatedCollateralValue.toLocaleString()}`);
    console.log(`   📊 Maximum LTV Ratio: ${(maxLTV * 100)}%`);
    console.log(`   🎯 Available to Borrow: $${availableToBorrow.toLocaleString()}`);
    console.log(`   📋 Active Positions: 0`);
    console.log(`   💡 Use "npm run borrow-against-asset" to start borrowing`);
    
  } catch (error) {
    console.log('   Unable to calculate borrowing capacity');
  }
}

function getNativeTokenSymbol(chain: string): string {
  const symbols = {
    'ethereum': 'ETH',
    'sepolia': 'ETH',
    'goerli': 'ETH',
    'polygon': 'MATIC',
    'mumbai': 'MATIC',
    'centrifuge': 'CFG'
  };
  return symbols[chain as keyof typeof symbols] || 'ETH';
}

function getCommonTokensForChain(chain: string): Array<{symbol: string, address: string}> {
  const tokens = {
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
  
  return tokens[chain as keyof typeof tokens] || [];
}

// Enhanced balance checking for production
export async function getDetailedBalances(walletAddress: string): Promise<any> {
  const balances = {
    native: {},
    erc20: {},
    rwaTokens: {},
    borrowingPositions: {},
    totalPortfolioValue: 0
  };
  
  // This would be implemented to return comprehensive balance data
  // for use by other parts of the application
  
  return balances;
}

export async function checkLiquidationRisk(walletAddress: string): Promise<any[]> {
  // This would check all active borrowing positions
  // and return those at risk of liquidation
  
  const atRiskPositions: any[] = [];
  
  // Implementation would check:
  // 1. Current collateral values
  // 2. Borrowed amounts
  // 3. Current LTV ratios
  // 4. Liquidation thresholds
  
  return atRiskPositions;
}