export interface Asset {
    id?: number;
    user_id?: string;
    name: string;
    description?: string;
    asset_type?: string;
    value_usd: number;
    currency?: string;
    documents?: any;
    metadata?: any;
    token_address?: string;
    token_amount?: number;
    tokenization_status?: string;
    centrifuge_asset_id?: string;
    ipfs_hash?: string;
    wallet_address: string;
    created_at?: string;
    updated_at?: string;
    is_active?: boolean;
}
export declare function pledgeAsset(name: string, valueUsd: number, documentPath?: string): Promise<Asset>;
export declare function listAssets(): Promise<void>;
export declare function getAssetById(assetId: string): Promise<Asset | null>;
export declare function updateAssetStatus(assetId: string, status: string): Promise<void>;
export declare function tokenizeAsset(assetId: string): Promise<void>;
