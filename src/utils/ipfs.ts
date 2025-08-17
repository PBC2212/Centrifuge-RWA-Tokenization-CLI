// src/utils/ipfs.ts
import { create as createIpfsClient, IPFSHTTPClient } from "ipfs-http-client";
import fs from "fs";
import path from "path";

/**
 * Initialize an IPFS client using either:
 * - ENV: IPFS_API_URL (e.g. https://ipfs.infura.io:5001 or https://ipfs.centrifuge.io)
 * - fallback: public gateway-compatible API (throws if not an API endpoint)
 *
 * NOTE: Gateways (like https://ipfs.io) are READ-ONLY and will NOT work for uploads.
 * Use a write-enabled IPFS API (Infura, web3.storage, Pinata, your own node, etc.)
 */
function getIpfsClient(): IPFSHTTPClient {
  const apiUrl =
    process.env.IPFS_API_URL ||
    process.env.IPFS_URL || // allow alternate var name
    "";

  if (!apiUrl) {
    throw new Error(
      "No IPFS API configured. Set IPFS_API_URL in .env (e.g., https://ipfs.infura.io:5001 or your node’s API URL)."
    );
  }

  // ipfs-http-client expects a URL string
  return createIpfsClient({ url: apiUrl });
}

export type IpfsAddResult = {
  cid: string;
  path: string;
  size: number;
};

export async function uploadJsonToIpfs(
  data: unknown,
  filename: string = "metadata.json"
): Promise<IpfsAddResult> {
  const client = getIpfsClient();
  const buffer = Buffer.from(JSON.stringify(data, null, 2), "utf-8");

  const result = await client.add(
    {
      path: filename,
      content: buffer,
    },
    {
      wrapWithDirectory: false,
      pin: true,
    }
  );

  return {
    cid: result.cid.toString(),
    path: result.path || filename,
    size: result.size ?? buffer.byteLength,
  };
}

export async function uploadFileToIpfs(filePath: string): Promise<IpfsAddResult> {
  const client = getIpfsClient();

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileName = path.basename(filePath);
  const stream = fs.createReadStream(filePath);

  const result = await client.add(
    {
      path: fileName,
      content: stream,
    },
    { wrapWithDirectory: false, pin: true }
  );

  return {
    cid: result.cid.toString(),
    path: result.path || fileName,
    size: result.size ?? 0,
  };
}

/**
 * Build a public gateway URL for a CID (read-only).
 * You can override the gateway via IPFS_GATEWAY in .env (default: https://ipfs.io/ipfs/).
 */
export function cidToGatewayUrl(cid: string): string {
  const gateway = process.env.IPFS_GATEWAY || "https://ipfs.io/ipfs/";
  return `${gateway}${cid}`;
}
