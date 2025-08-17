import { ethers } from "ethers";
import axios from "axios";
const RPC_ENDPOINTS = {
    sepolia: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    base: process.env.BASE_RPC_URL || "https://base-rpc.publicnode.com",
    arbitrum: process.env.ARBITRUM_RPC_URL || "https://arbitrum-one-rpc.publicnode.com",
    mainnet: process.env.MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com",
    polygon: process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com",
};
export async function getPools() {
    try {
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
                    let pools = [];
                    if (Array.isArray(response.data)) {
                        pools = response.data;
                    }
                    else if (response.data.data && Array.isArray(response.data.data)) {
                        pools = response.data.data;
                    }
                    else if (response.data.pools && Array.isArray(response.data.pools)) {
                        pools = response.data.pools;
                    }
                    if (pools.length > 0) {
                        console.log(`✅ Found ${pools.length} pools from ${endpoint}`);
                        return pools;
                    }
                }
            }
            catch (endpointErr) {
                console.log(`❌ Failed ${endpoint}: ${endpointErr.response?.status || endpointErr.message}`);
                continue;
            }
        }
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
    }
    catch (err) {
        console.error("Error in getPools:", err.message);
        return [];
    }
}
export async function getBalance(wallet, chain = "sepolia") {
    try {
        const rpcUrl = RPC_ENDPOINTS[chain];
        if (!rpcUrl) {
            throw new Error(`Unsupported chain: ${chain}. Supported chains: ${Object.keys(RPC_ENDPOINTS).join(", ")}`);
        }
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const connectedWallet = wallet.connect(provider);
        const balance = await provider.getBalance(connectedWallet.address);
        return ethers.formatEther(balance);
    }
    catch (err) {
        if (err.code === 'NETWORK_ERROR') {
            throw new Error(`Network error connecting to ${chain}: ${err.message}`);
        }
        else if (err.code === 'SERVER_ERROR') {
            throw new Error(`RPC server error for ${chain}: ${err.message}`);
        }
        else {
            throw new Error(`Failed to get balance for ${chain}: ${err.message}`);
        }
    }
}
export async function getChainInfo(chain) {
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
    }
    catch (err) {
        throw new Error(`Failed to get chain info for ${chain}: ${err.message}`);
    }
}
export async function validateRpcEndpoint(chain) {
    try {
        const rpcUrl = RPC_ENDPOINTS[chain];
        if (!rpcUrl)
            return false;
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        await provider.getBlockNumber();
        return true;
    }
    catch (err) {
        return false;
    }
}
