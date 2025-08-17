export interface Pool {
    id: string;
    centrifuge_pool_id: string;
    name: string;
    description?: string;
    asset_class: string;
    total_value_locked: number;
    apy: number;
    currency: string;
    minimum_investment: number;
    maximum_investment: number;
    pool_status: string;
    metadata: any;
}
export declare function listPools(): Promise<void>;
export declare function getPoolDetails(poolId: string): Promise<Pool | null>;
export declare function investInPool(poolId: string, amount: number, userId: string): Promise<string>;
