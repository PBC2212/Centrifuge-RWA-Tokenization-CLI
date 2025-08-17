import { create as createIpfsClient } from "ipfs-http-client";
import fs from "fs";
import path from "path";
function getIpfsClient() {
    const apiUrl = process.env.IPFS_API_URL ||
        process.env.IPFS_URL ||
        "";
    if (!apiUrl) {
        throw new Error("No IPFS API configured. Set IPFS_API_URL in .env (e.g., https://ipfs.infura.io:5001 or your node’s API URL).");
    }
    return createIpfsClient({ url: apiUrl });
}
export async function uploadJsonToIpfs(data, filename = "metadata.json") {
    const client = getIpfsClient();
    const buffer = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
    const result = await client.add({
        path: filename,
        content: buffer,
    }, {
        wrapWithDirectory: false,
        pin: true,
    });
    return {
        cid: result.cid.toString(),
        path: result.path || filename,
        size: result.size ?? buffer.byteLength,
    };
}
export async function uploadFileToIpfs(filePath) {
    const client = getIpfsClient();
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    const fileName = path.basename(filePath);
    const stream = fs.createReadStream(filePath);
    const result = await client.add({
        path: fileName,
        content: stream,
    }, { wrapWithDirectory: false, pin: true });
    return {
        cid: result.cid.toString(),
        path: result.path || fileName,
        size: result.size ?? 0,
    };
}
export function cidToGatewayUrl(cid) {
    const gateway = process.env.IPFS_GATEWAY || "https://ipfs.io/ipfs/";
    return `${gateway}${cid}`;
}
