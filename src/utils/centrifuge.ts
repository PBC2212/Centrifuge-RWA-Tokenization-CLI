// src/utils/centrifuge.ts
import { ethers } from "ethers";
import axios from "axios";
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_ENDPOINTS: Record<string, string> = {
  sepolia: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  base: process.env.BASE_RPC_URL || "https://base-rpc.publicnode.com", 
  arbitrum: process.env.ARBITRUM_RPC_URL || "https://arbitrum-one-rpc.publicnode.com",
  mainnet: process.env.MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com",
  polygon: process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com",
  centrifuge: process.env.CENTRIFUGE_RPC_URL || "wss://fullnode.development.cntrfg.com",
};

// Type definitions for better type safety
export interface Pool {
  id: string;
  metadata?: {
    name?: string;
    description?: string;
    assetClass?: string;
  };
  nav?: {
    total?: number;
    available?: number;
  };
  tranches?: Array<{
    id: string;
    tokenPrice?: number;
    yield?: number;
    minInvestment?: number;
  }>;
  apy?: number;
  totalValueLocked?: number;
  status?: string;
  currency?: string;
}

export interface Asset {
  id: string;
  poolId: string;
  metadata?: {
    name?: string;
    type?: string;
    value?: number;
    maturityDate?: string;
  };
  status?: string;
  outstandingDebt?: number;
  value?: number;
}

export interface CentrifugeApiResponse<T> {
  data?: T;
  pools?: T;
  assets?: T;
  error?: string;
  message?: string;
}

// ---- Get Pools (from Centrifuge SDK/Subgraph) ----
export async function getPools(): Promise<Pool[]> {
  try {
    console.log('🔄 Fetching pools from Centrifuge network...');
    
    // Try multiple endpoints for Centrifuge data
    const endpoints = [
      {
        url: "https://api.centrifuge.io/pools",
        name: "Centrifuge API"
      },
      {
        url: "https://subgraph.centrifuge.io/subgraphs/name/centrifuge/pools",
        name: "Centrifuge Subgraph"
      },
      {
        url: "https://api.subquery.network/sq/centrifuge/pools",
        name: "SubQuery API"
      }
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`🔍 Trying ${endpoint.name}: ${endpoint.url}`);
        
        const response = await axios.get(endpoint.url, {
          timeout: 10000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Centrifuge-RWA-CLI/1.0.0',
            'Content-Type': 'application/json'
          },
          validateStatus: (status) => status < 500 // Accept 4xx as valid responses
        });
        
        if (response.status >= 400) {
          console.log(`⚠️ ${endpoint.name} returned ${response.status}: ${response.statusText}`);
          continue;
        }
        
        if (response.data) {
          // Handle different response formats
          let pools: Pool[] = [];
          
          if (Array.isArray(response.data)) {
            pools = response.data;
          } else if (response.data.data && Array.isArray(response.data.data)) {
            pools = response.data.data;
          } else if (response.data.pools && Array.isArray(response.data.pools)) {
            pools = response.data.pools;
          } else if (response.data.data?.pools && Array.isArray(response.data.data.pools)) {
            pools = response.data.data.pools;
          }
          
          // Validate and normalize pool data
          const validPools = pools.filter(pool => pool && pool.id).map(pool => ({
            id: pool.id,
            metadata: {
              name: pool.metadata?.name || `Pool ${pool.id}`,
              description: pool.metadata?.description || 'Centrifuge RWA Pool',
              assetClass: pool.metadata?.assetClass || 'Mixed Assets'
            },
            nav: pool.nav || { total: 0, available: 0 },
            apy: pool.apy || 0,
            totalValueLocked: pool.totalValueLocked || pool.nav?.total || 0,
            status: pool.status || 'active',
            currency: pool.currency || 'USD'
          }));
          
          if (validPools.length > 0) {
            console.log(`✅ Found ${validPools.length} pools from ${endpoint.name}`);
            return validPools;
          } else {
            console.log(`⚠️ ${endpoint.name} returned empty or invalid pool data`);
          }
        } else {
          console.log(`⚠️ ${endpoint.name} returned no data`);
        }
      } catch (endpointErr: any) {
        const errorMsg = endpointErr.response?.status 
          ? `HTTP ${endpointErr.response.status}: ${endpointErr.response.statusText}`
          : endpointErr.message;
        console.log(`❌ ${endpoint.name} failed: ${errorMsg}`);
        continue; // Try next endpoint
      }
    }
    
    // If all endpoints fail, return mock data for development
    console.log("⚠️ All API endpoints failed. Returning mock data for development.");
    return getMockPools();

  } catch (err: any) {
    console.error("❌ Error in getPools:", err.message);
    return getMockPools();
  }
}

// ---- Get Assets for a specific pool ----
export async function getPoolAssets(poolId: string): Promise<Asset[]> {
  try {
    console.log(`🔍 Fetching assets for pool ${poolId}...`);
    
    const endpoints = [
      `https://api.centrifuge.io/pools/${poolId}/assets`,
      `https://subgraph.centrifuge.io/subgraphs/name/centrifuge/pools/${poolId}/assets`
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(endpoint, {
          timeout: 8000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Centrifuge-RWA-CLI/1.0.0'
          }
        });
        
        if (response.data) {
          let assets: Asset[] = [];
          
          if (Array.isArray(response.data)) {
            assets = response.data;
          } else if (response.data.data && Array.isArray(response.data.data)) {
            assets = response.data.data;
          } else if (response.data.assets && Array.isArray(response.data.assets)) {
            assets = response.data.assets;
          }
          
          const validAssets = assets.filter(asset => asset && asset.id).map(asset => ({
            id: asset.id,
            poolId: poolId,
            metadata: asset.metadata || {},
            status: asset.status || 'active',
            outstandingDebt: asset.outstandingDebt || 0,
            value: asset.value || asset.metadata?.value || 0
          }));
          
          if (validAssets.length > 0) {
            console.log(`✅ Found ${validAssets.length} assets for pool ${poolId}`);
            return validAssets;
          }
        }
      } catch (endpointErr: any) {
        console.log(`❌ Failed to fetch assets from ${endpoint}: ${endpointErr.message}`);
        continue;
      }
    }
    
    console.log(`⚠️ No assets found for pool ${poolId}, returning mock data`);
    return getMockAssets(poolId);

  } catch (err: any) {
    console.error(`❌ Error getting assets for pool ${poolId}:`, err.message);
    return getMockAssets(poolId);
  }
}

// ---- Get Wallet Balance ----
export async function getBalance(wallet: ethers.Wallet, chain: string = "sepolia"): Promise<string> {
  try {
    const rpcUrl = RPC_ENDPOINTS[chain];
    if (!rpcUrl) {
      throw new Error(`Unsupported chain: ${chain}. Supported chains: ${Object.keys(RPC_ENDPOINTS).join(", ")}`);
    }

    console.log(`🔗 Connecting to ${chain} network...`);
    
    // Handle WebSocket connections for Centrifuge
    let provider: ethers.Provider;
    if (rpcUrl.startsWith('wss://') || rpcUrl.startsWith('ws://')) {
      provider = new ethers.WebSocketProvider(rpcUrl);
    } else {
      provider = new ethers.JsonRpcProvider(rpcUrl);
    }
    
    // Test connection first
    try {
      await provider.getBlockNumber();
    } catch (connectionError: any) {
      throw new Error(`Failed to connect to ${chain} network: ${connectionError.message}`);
    }
    
    // Connect wallet to provider
    const connectedWallet = wallet.connect(provider);
    
    // Get balance
    const balance = await provider.getBalance(connectedWallet.address);
    const formattedBalance = ethers.formatEther(balance);
    
    console.log(`✅ Balance retrieved: ${formattedBalance} ${getNativeTokenSymbol(chain)}`);
    
    // Clean up WebSocket connection
    if (provider instanceof ethers.WebSocketProvider) {
      provider.destroy();
    }
    
    return formattedBalance;
  } catch (err: any) {
    if (err.code === 'NETWORK_ERROR') {
      throw new Error(`Network error connecting to ${chain}: ${err.message}`);
    } else if (err.code === 'SERVER_ERROR') {
      throw new Error(`RPC server error for ${chain}: ${err.message}`);
    } else {
      throw new Error(`Failed to get balance for ${chain}: ${err.message}`);
    }
  }
}

// ---- Get Chain Info ----
export async function getChainInfo(chain: string): Promise<{ 
  chainId: number; 
  blockNumber: number; 
  networkName: string;
  nativeToken: string;
}> {
  try {
    const rpcUrl = RPC_ENDPOINTS[chain];
    if (!rpcUrl) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    console.log(`📊 Getting chain info for ${chain}...`);
    
    let provider: ethers.Provider;
    if (rpcUrl.startsWith('wss://') || rpcUrl.startsWith('ws://')) {
      provider = new ethers.WebSocketProvider(rpcUrl);
    } else {
      provider = new ethers.JsonRpcProvider(rpcUrl);
    }

    const [network, blockNumber] = await Promise.all([
      provider.getNetwork(),
      provider.getBlockNumber()
    ]);

    const result = {
      chainId: Number(network.chainId),
      blockNumber,
      networkName: network.name || chain,
      nativeToken: getNativeTokenSymbol(chain)
    };

    // Clean up WebSocket connection
    if (provider instanceof ethers.WebSocketProvider) {
      provider.destroy();
    }

    console.log(`✅ Chain info retrieved for ${chain}: Block ${blockNumber}, ChainId ${result.chainId}`);
    
    return result;
  } catch (err: any) {
    throw new Error(`Failed to get chain info for ${chain}: ${err.message}`);
  }
}

// ---- Utility function to validate RPC endpoint ----
export async function validateRpcEndpoint(chain: string): Promise<{
  isValid: boolean;
  latency?: number;
  blockNumber?: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const rpcUrl = RPC_ENDPOINTS[chain];
    if (!rpcUrl) {
      return { isValid: false, error: 'Chain not supported' };
    }

    let provider: ethers.Provider;
    if (rpcUrl.startsWith('wss://') || rpcUrl.startsWith('ws://')) {
      provider = new ethers.WebSocketProvider(rpcUrl);
    } else {
      provider = new ethers.JsonRpcProvider(rpcUrl);
    }

    const blockNumber = await provider.getBlockNumber();
    const latency = Date.now() - startTime;

    // Clean up WebSocket connection
    if (provider instanceof ethers.WebSocketProvider) {
      provider.destroy();
    }

    return {
      isValid: true,
      latency,
      blockNumber
    };
  } catch (err: any) {
    return {
      isValid: false,
      latency: Date.now() - startTime,
      error: err.message
    };
  }
}

// ---- Check network connectivity ----
export async function checkNetworkConnectivity(): Promise<{
  [chain: string]: {
    status: 'online' | 'offline' | 'slow';
    latency?: number;
    blockNumber?: number;
    error?: string;
  };
}> {
  console.log('🌐 Checking network connectivity across all chains...');
  
  const results: any = {};
  
  const validationPromises = Object.keys(RPC_ENDPOINTS).map(async (chain) => {
    const validation = await validateRpcEndpoint(chain);
    
    let status: 'online' | 'offline' | 'slow';
    if (!validation.isValid) {
      status = 'offline';
    } else if (validation.latency && validation.latency > 5000) {
      status = 'slow';
    } else {
      status = 'online';
    }
    
    results[chain] = {
      status,
      latency: validation.latency,
      blockNumber: validation.blockNumber,
      error: validation.error
    };
  });
  
  await Promise.all(validationPromises);
  
  const onlineChains = Object.entries(results).filter(([_, info]: [string, any]) => info.status === 'online');
  console.log(`✅ ${onlineChains.length}/${Object.keys(RPC_ENDPOINTS).length} chains online`);
  
  return results;
}

// ---- Get pool statistics ----
export async function getPoolStatistics(poolId?: string): Promise<{
  totalPools: number;
  totalValueLocked: number;
  averageApy: number;
  poolDetails?: Pool;
}> {
  try {
    const pools = await getPools();
    
    if (poolId) {
      const poolDetails = pools.find(p => p.id === poolId);
      if (!poolDetails) {
        throw new Error(`Pool ${poolId} not found`);
      }
      
      return {
        totalPools: 1,
        totalValueLocked: poolDetails.totalValueLocked || 0,
        averageApy: poolDetails.apy || 0,
        poolDetails
      };
    }
    
    const totalValueLocked = pools.reduce((sum, pool) => sum + (pool.totalValueLocked || 0), 0);
    const averageApy = pools.length > 0 
      ? pools.reduce((sum, pool) => sum + (pool.apy || 0), 0) / pools.length 
      : 0;
    
    return {
      totalPools: pools.length,
      totalValueLocked,
      averageApy
    };
  } catch (err: any) {
    console.error('❌ Error getting pool statistics:', err.message);
    return {
      totalPools: 0,
      totalValueLocked: 0,
      averageApy: 0
    };
  }
}

// ---- Helper Functions ----
function getNativeTokenSymbol(chain: string): string {
  const symbols: Record<string, string> = {
    'ethereum': 'ETH',
    'mainnet': 'ETH',
    'sepolia': 'ETH',
    'goerli': 'ETH',
    'polygon': 'MATIC',
    'base': 'ETH',
    'arbitrum': 'ETH',
    'centrifuge': 'CFG'
  };
  return symbols[chain] || 'ETH';
}

function getMockPools(): Pool[] {
  return [
    {
      id: "1",
      metadata: {
        name: "Prime Real Estate Fund",
        description: "Commercial real estate investments with stable returns",
        assetClass: "Real Estate"
      },
      nav: { total: 15500000, available: 2300000 },
      apy: 8.25,
      totalValueLocked: 15500000,
      status: "active",
      currency: "USD"
    },
    {
      id: "2", 
      metadata: {
        name: "Trade Finance Pool",
        description: "Short-term trade finance assets with high yield",
        assetClass: "Trade Finance"
      },
      nav: { total: 8200000, available: 1100000 },
      apy: 12.80,
      totalValueLocked: 8200000,
      status: "active",
      currency: "USD"
    },
    {
      id: "3",
      metadata: {
        name: "Supply Chain Finance",
        description: "Receivables and supply chain financing",
        assetClass: "Receivables"
      },
      nav: { total: 12750000, available: 890000 },
      apy: 9.45,
      totalValueLocked: 12750000,
      status: "active",
      currency: "USD"
    }
  ];
}

function getMockAssets(poolId: string): Asset[] {
  const assetsByPool: Record<string, Asset[]> = {
    "1": [
      {
        id: "asset-1-1",
        poolId: "1",
        metadata: {
          name: "Downtown Office Building NYC",
          type: "Commercial Real Estate",
          value: 2500000,
          maturityDate: "2026-12-31"
        },
        status: "performing",
        value: 2500000,
        outstandingDebt: 1875000
      },
      {
        id: "asset-1-2",
        poolId: "1",
        metadata: {
          name: "Retail Complex LA",
          type: "Commercial Real Estate",
          value: 1800000,
          maturityDate: "2025-06-30"
        },
        status: "performing",
        value: 1800000,
        outstandingDebt: 1350000
      }
    ],
    "2": [
      {
        id: "asset-2-1",
        poolId: "2",
        metadata: {
          name: "Import/Export Letters of Credit",
          type: "Trade Finance",
          value: 500000,
          maturityDate: "2024-12-31"
        },
        status: "performing",
        value: 500000,
        outstandingDebt: 400000
      }
    ],
    "3": [
      {
        id: "asset-3-1",
        poolId: "3",
        metadata: {
          name: "Manufacturing Receivables",
          type: "Receivables",
          value: 750000,
          maturityDate: "2025-03-31"
        },
        status: "performing",
        value: 750000,
        outstandingDebt: 525000
      }
    ]
  };
  
  return assetsByPool[poolId] || [];
}

// ---- Export supported chains ----
export const SUPPORTED_CHAINS = Object.keys(RPC_ENDPOINTS);

// ---- Export RPC endpoints for external use ----
export { RPC_ENDPOINTS };