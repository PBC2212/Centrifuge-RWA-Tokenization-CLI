import { ethers } from "ethers";
export interface Pool {
    id: string;
    metadata?: {
        name?: string;
        description?: string;
    };
}
export declare function getPools(): Promise<Pool[]>;
export declare function getBalance(wallet: ethers.Wallet, chain?: string): Promise<string>;
export declare function getChainInfo(chain: string): Promise<{
    chainId: number;
    blockNumber: number;
}>;
export declare function validateRpcEndpoint(chain: string): Promise<boolean>;
