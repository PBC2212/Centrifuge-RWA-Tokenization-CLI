export type IpfsAddResult = {
    cid: string;
    path: string;
    size: number;
};
export declare function uploadJsonToIpfs(data: unknown, filename?: string): Promise<IpfsAddResult>;
export declare function uploadFileToIpfs(filePath: string): Promise<IpfsAddResult>;
export declare function cidToGatewayUrl(cid: string): string;
