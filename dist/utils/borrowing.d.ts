export interface BorrowPosition {
    id?: string;
    user_id: string;
    asset_id: string;
    pool_id: string;
    collateral_value_usd: number;
    borrowed_amount_usd: number;
    interest_rate: number;
    loan_to_value_ratio: number;
    liquidation_threshold: number;
    status: 'active' | 'repaid' | 'liquidated' | 'defaulted';
    start_date: string;
    maturity_date: string;
    last_payment_date?: string;
    total_interest_accrued: number;
    transaction_hash?: string;
    created_at?: string;
    updated_at?: string;
}
export interface CollateralAsset {
    id: string;
    name: string;
    value_usd: number;
    tokenization_status: string;
    token_address?: string;
    available_for_collateral: boolean;
}
export declare function borrowAgainstAsset(): Promise<BorrowPosition>;
export declare function listBorrowPositions(): Promise<void>;
export declare function repayLoan(positionId?: string): Promise<void>;
