// src/utils/ipfs.ts
import { create as createIpfsClient, IPFSHTTPClient } from "ipfs-http-client";
import fs from "fs";
import path from "path";
import axios from "axios";
import * as dotenv from 'dotenv';

dotenv.config();

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
      "No IPFS API configured. Set IPFS_API_URL in .env (e.g., https://ipfs.infura.io:5001 or your node's API URL)."
    );
  }

  try {
    // ipfs-http-client expects a URL string
    return createIpfsClient({ url: apiUrl });
  } catch (clientError: any) {
    throw new Error(`Failed to create IPFS client: ${clientError.message}`);
  }
}

export type IpfsAddResult = {
  cid: string;
  path: string;
  size: number;
  gatewayUrl: string;
  timestamp: string;
};

export type IpfsUploadOptions = {
  pin?: boolean;
  wrapWithDirectory?: boolean;
  timeout?: number;
  progress?: (bytes: number) => void;
};

export async function uploadJsonToIpfs(
  data: unknown,
  filename: string = "metadata.json",
  options: IpfsUploadOptions = {}
): Promise<IpfsAddResult> {
  try {
    console.log(`📤 Uploading JSON to IPFS: ${filename}`);
    
    // Validate input data
    if (data === null || data === undefined) {
      throw new Error('Data cannot be null or undefined');
    }
    
    const client = getIpfsClient();
    
    // Serialize and validate JSON
    let jsonString: string;
    try {
      jsonString = JSON.stringify(data, null, 2);
    } catch (serializeError: any) {
      throw new Error(`Failed to serialize data to JSON: ${serializeError.message}`);
    }
    
    const buffer = Buffer.from(jsonString, "utf-8");
    console.log(`📊 JSON size: ${buffer.byteLength} bytes`);

    const uploadOptions = {
      wrapWithDirectory: options.wrapWithDirectory ?? false,
      pin: options.pin ?? true,
      timeout: options.timeout ?? 30000,
      progress: options.progress
    };

    console.log('🔄 Uploading to IPFS network...');
    const result = await client.add(
      {
        path: filename,
        content: buffer,
      },
      uploadOptions
    );

    const uploadResult: IpfsAddResult = {
      cid: result.cid.toString(),
      path: result.path || filename,
      size: result.size ?? buffer.byteLength,
      gatewayUrl: cidToGatewayUrl(result.cid.toString()),
      timestamp: new Date().toISOString()
    };

    console.log('✅ JSON uploaded to IPFS successfully!');
    console.log(`🔗 CID: ${uploadResult.cid}`);
    console.log(`🌐 Gateway URL: ${uploadResult.gatewayUrl}`);

    // Verify upload by attempting to retrieve
    await verifyIpfsUpload(uploadResult.cid, 'json');

    return uploadResult;

  } catch (error: any) {
    console.error('❌ Failed to upload JSON to IPFS:', error.message);
    throw new Error(`IPFS JSON upload failed: ${error.message}`);
  }
}

export async function uploadFileToIpfs(
  filePath: string, 
  options: IpfsUploadOptions = {}
): Promise<IpfsAddResult> {
  try {
    console.log(`📤 Uploading file to IPFS: ${filePath}`);

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Get file info
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    console.log(`📊 File size: ${stats.size} bytes`);

    // Check file size limits (default 100MB)
    const maxFileSize = parseInt(process.env.IPFS_MAX_FILE_SIZE || '104857600'); // 100MB
    if (stats.size > maxFileSize) {
      throw new Error(`File size (${stats.size} bytes) exceeds maximum allowed size (${maxFileSize} bytes)`);
    }

    const client = getIpfsClient();
    const stream = fs.createReadStream(filePath);

    const uploadOptions = {
      wrapWithDirectory: options.wrapWithDirectory ?? false,
      pin: options.pin ?? true,
      timeout: options.timeout ?? 60000, // Longer timeout for files
      progress: options.progress
    };

    console.log('🔄 Uploading to IPFS network...');
    const result = await client.add(
      {
        path: fileName,
        content: stream,
      },
      uploadOptions
    );

    const uploadResult: IpfsAddResult = {
      cid: result.cid.toString(),
      path: result.path || fileName,
      size: result.size ?? stats.size,
      gatewayUrl: cidToGatewayUrl(result.cid.toString()),
      timestamp: new Date().toISOString()
    };

    console.log('✅ File uploaded to IPFS successfully!');
    console.log(`🔗 CID: ${uploadResult.cid}`);
    console.log(`🌐 Gateway URL: ${uploadResult.gatewayUrl}`);

    // Verify upload by attempting to retrieve
    await verifyIpfsUpload(uploadResult.cid, 'file');

    return uploadResult;

  } catch (error: any) {
    console.error('❌ Failed to upload file to IPFS:', error.message);
    throw new Error(`IPFS file upload failed: ${error.message}`);
  }
}

/**
 * Build a public gateway URL for a CID (read-only).
 * You can override the gateway via IPFS_GATEWAY in .env (default: https://ipfs.io/ipfs/).
 */
export function cidToGatewayUrl(cid: string): string {
  if (!cid || typeof cid !== 'string') {
    throw new Error('Invalid CID provided');
  }

  const gateway = process.env.IPFS_GATEWAY || "https://ipfs.io/ipfs/";
  
  // Ensure gateway ends with /
  const normalizedGateway = gateway.endsWith('/') ? gateway : gateway + '/';
  
  return `${normalizedGateway}${cid}`;
}

/**
 * Retrieve content from IPFS using CID
 */
export async function retrieveFromIpfs(cid: string): Promise<{
  content: Buffer;
  size: number;
  contentType?: string;
}> {
  try {
    console.log(`📥 Retrieving content from IPFS: ${cid}`);

    if (!cid || typeof cid !== 'string') {
      throw new Error('Invalid CID provided');
    }

    const client = getIpfsClient();
    
    console.log('🔄 Fetching from IPFS network...');
    const chunks: Uint8Array[] = [];
    
    for await (const chunk of client.cat(cid)) {
      chunks.push(chunk);
    }
    
    const content = Buffer.concat(chunks);
    console.log(`✅ Retrieved ${content.length} bytes from IPFS`);

    return {
      content,
      size: content.length,
      contentType: detectContentType(content)
    };

  } catch (error: any) {
    console.error('❌ Failed to retrieve from IPFS:', error.message);
    throw new Error(`IPFS retrieval failed: ${error.message}`);
  }
}

/**
 * Retrieve JSON data from IPFS
 */
export async function retrieveJsonFromIpfs<T = any>(cid: string): Promise<T> {
  try {
    const { content } = await retrieveFromIpfs(cid);
    const jsonString = content.toString('utf-8');
    
    try {
      return JSON.parse(jsonString) as T;
    } catch (parseError: any) {
      throw new Error(`Invalid JSON content: ${parseError.message}`);
    }
  } catch (error: any) {
    throw new Error(`Failed to retrieve JSON from IPFS: ${error.message}`);
  }
}

/**
 * Check if content is available on IPFS
 */
export async function verifyIpfsUpload(cid: string, expectedType: 'json' | 'file' = 'file'): Promise<boolean> {
  try {
    console.log(`🔍 Verifying IPFS upload: ${cid}`);

    // Try multiple verification methods
    const verificationMethods = [
      () => verifyViaClient(cid),
      () => verifyViaGateway(cid),
      () => verifyViaMultipleGateways(cid)
    ];

    for (const method of verificationMethods) {
      try {
        const isAvailable = await method();
        if (isAvailable) {
          console.log('✅ IPFS content verified and accessible');
          return true;
        }
      } catch (methodError) {
        // Try next method
        continue;
      }
    }

    console.warn('⚠️ IPFS content may not be immediately available');
    return false;

  } catch (error: any) {
    console.warn('⚠️ Could not verify IPFS upload:', error.message);
    return false;
  }
}

async function verifyViaClient(cid: string): Promise<boolean> {
  try {
    const client = getIpfsClient();
    const stats = await client.object.stat(cid);
    return stats.Hash === cid;
  } catch (error) {
    return false;
  }
}

async function verifyViaGateway(cid: string): Promise<boolean> {
  try {
    const gatewayUrl = cidToGatewayUrl(cid);
    const response = await axios.head(gatewayUrl, { timeout: 10000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function verifyViaMultipleGateways(cid: string): Promise<boolean> {
  const gateways = [
    'https://ipfs.io/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://dweb.link/ipfs/'
  ];

  for (const gateway of gateways) {
    try {
      const url = `${gateway}${cid}`;
      const response = await axios.head(url, { timeout: 5000 });
      if (response.status === 200) {
        return true;
      }
    } catch (error) {
      continue;
    }
  }

  return false;
}

/**
 * Pin content to IPFS to ensure persistence
 */
export async function pinToIpfs(cid: string): Promise<boolean> {
  try {
    console.log(`📌 Pinning content to IPFS: ${cid}`);

    const client = getIpfsClient();
    await client.pin.add(cid);
    
    console.log('✅ Content pinned successfully');
    return true;

  } catch (error: any) {
    console.error('❌ Failed to pin content:', error.message);
    return false;
  }
}

/**
 * Unpin content from IPFS
 */
export async function unpinFromIpfs(cid: string): Promise<boolean> {
  try {
    console.log(`📌 Unpinning content from IPFS: ${cid}`);

    const client = getIpfsClient();
    await client.pin.rm(cid);
    
    console.log('✅ Content unpinned successfully');
    return true;

  } catch (error: any) {
    console.error('❌ Failed to unpin content:', error.message);
    return false;
  }
}

/**
 * List pinned content
 */
export async function listPinnedContent(): Promise<string[]> {
  try {
    console.log('📋 Listing pinned content...');

    const client = getIpfsClient();
    const pinnedItems: string[] = [];
    
    for await (const { cid } of client.pin.ls()) {
      pinnedItems.push(cid.toString());
    }
    
    console.log(`✅ Found ${pinnedItems.length} pinned items`);
    return pinnedItems;

  } catch (error: any) {
    console.error('❌ Failed to list pinned content:', error.message);
    return [];
  }
}

/**
 * Get IPFS node information
 */
export async function getIpfsNodeInfo(): Promise<{
  id: string;
  version: string;
  protocol: string;
  addresses: string[];
}> {
  try {
    const client = getIpfsClient();
    const id = await client.id();
    
    return {
      id: id.id,
      version: id.agentVersion || 'unknown',
      protocol: id.protocolVersion || 'unknown',
      addresses: id.addresses?.map(addr => addr.toString()) || []
    };

  } catch (error: any) {
    throw new Error(`Failed to get IPFS node info: ${error.message}`);
  }
}

/**
 * Test IPFS connectivity
 */
export async function testIpfsConnection(): Promise<{
  connected: boolean;
  nodeInfo?: any;
  error?: string;
  responseTime: number;
}> {
  const startTime = Date.now();
  
  try {
    console.log('🔄 Testing IPFS connection...');
    
    const nodeInfo = await getIpfsNodeInfo();
    const responseTime = Date.now() - startTime;
    
    console.log('✅ IPFS connection successful');
    console.log(`📊 Response time: ${responseTime}ms`);
    
    return {
      connected: true,
      nodeInfo,
      responseTime
    };

  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    console.error('❌ IPFS connection failed:', error.message);
    
    return {
      connected: false,
      error: error.message,
      responseTime
    };
  }
}

// Helper function to detect content type
function detectContentType(buffer: Buffer): string {
  // Simple content type detection based on file headers
  const header = buffer.slice(0, 4);
  
  if (header[0] === 0xFF && header[1] === 0xD8) return 'image/jpeg';
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return 'image/png';
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) return 'image/gif';
  if (header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46) return 'application/pdf';
  
  // Try to detect JSON
  try {
    const text = buffer.toString('utf-8', 0, Math.min(100, buffer.length));
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      JSON.parse(buffer.toString('utf-8'));
      return 'application/json';
    }
  } catch (error) {
    // Not JSON
  }
  
  return 'application/octet-stream';
}

// Export configuration for external use
export const IPFS_CONFIG = {
  apiUrl: process.env.IPFS_API_URL,
  gateway: process.env.IPFS_GATEWAY || "https://ipfs.io/ipfs/",
  maxFileSize: parseInt(process.env.IPFS_MAX_FILE_SIZE || '104857600')
};