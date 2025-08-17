// src/utils/centrifuge.ts
import { ethers } from "ethers";
import axios from "axios";

const RPC_ENDPOINTS: Record<string, string> = {
  sepolia: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  base: process.env.BASE_RPC_URL || "https://base-rpc.publicnode.com", 
  arbitrum: process.env.ARBITRUM_RPC_URL || "https://arbitrum-one-rpc.publicnode.com",
  mainnet: process.env.MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com",
  polygon: process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com",
};

// Type definitions for better type safety
export interface Pool {
  id: string;
  metadata?: {
    name?: string;
    description?: string;
  };
  // Add other pool properties as needed
}

// ---- Get Pools (from Centrifuge SDK/Subgraph) ----
export async function getPools(): Promise<Pool[]> {
  try {
    // Try multiple endpoints for Centrifuge data
    const endpoints = [
      "https://api.subquery.network/sq/centrifuge/pools",
      "https://subgraph.centrifuge.io/subgraphs/name/centrifuge/pools", 
      "https://api.centrifuge.io/pools",
      "https://centrifuge-api.herokuapp.com/pools"
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`🔍 Trying endpoint: ${endpoint}`);
        
        const response = await axios.get(endpoint, {
          timeout: 8000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Centrifuge-RWA-CLI/1.0.0'
          }
        });
        
        if (response.data) {
          // Handle different response formats
          let pools = [];
          
          if (Array.isArray(response.data)) {
            pools = response.data;
          } else if (response.data.data && Array.isArray(response.data.data)) {
            pools = response.data.data;
          } else if (response.data.pools && Array.isArray(response.data.pools)) {
            pools = response.data.pools;
          }
          
          if (pools.length > 0) {
            console.log(`✅ Found ${pools.length} pools from ${endpoint}`);
            return pools;
          }
        }
      } catch (endpointErr: any) {
        console.log(`❌ Failed ${endpoint}: ${endpointErr.response?.status || endpointErr.message}`);
        continue; // Try next endpoint
      }
    }
    
    // If all endpoints fail, return mock data for development
    console.log("⚠️  All API endpoints failed. Returning mock data for development.");
    return [
      {
        id: "1",
        metadata: {
          name: "Mock Pool 1 - Real Estate Fund",
          description: "Development pool for testing"
        }
      },
      {
        id: "2", 
        metadata: {
          name: "Mock Pool 2 - Trade Finance",
          description: "Development pool for testing"
        }
      }
    ];

  } catch (err: any) {
    console.error("Error in getPools:", err.message);
    return [];
  }
}

// ---- Get Wallet Balance ----
export async function getBalance(wallet: ethers.Wallet, chain: string = "sepolia"): Promise<string> {
  try {
    const rpcUrl = RPC_ENDPOINTS[chain];
    if (!rpcUrl) {
      throw new Error(`Unsupported chain: ${chain}. Supported chains: ${Object.keys(RPC_ENDPOINTS).join(", ")}`);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Connect wallet to provider
    const connectedWallet = wallet.connect(provider);
    
    // Get balance
    const balance = await provider.getBalance(connectedWallet.address);
    
    return ethers.formatEther(balance);
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
export async function getChainInfo(chain: string): Promise<{ chainId: number; blockNumber: number }> {
  try {
    const rpcUrl = RPC_ENDPOINTS[chain];
    if (!rpcUrl) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();

    return {
      chainId: Number(network.chainId),
      blockNumber
    };
  } catch (err: any) {
    throw new Error(`Failed to get chain info for ${chain}: ${err.message}`);
  }
}

// ---- Utility function to validate RPC endpoint ----
export async function validateRpcEndpoint(chain: string): Promise<boolean> {
  try {
    const rpcUrl = RPC_ENDPOINTS[chain];
    if (!rpcUrl) return false;

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    await provider.getBlockNumber();
    return true;
  } catch (err) {
    return false;
  }
}