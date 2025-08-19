import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import * as dotenv from 'dotenv';

dotenv.config();

export async function mintNFT(description: string, classId: number) {
  try {
    // Validate environment variables
    const rpcUrl = process.env.CENTRIFUGE_RPC_URL;
    const privateKey = process.env.CENTRIFUGE_ADMIN_PRIVATE_KEY || process.env.WALLET_SEED;
    
    if (!rpcUrl) {
      throw new Error('CENTRIFUGE_RPC_URL is not set in environment variables');
    }
    
    if (!privateKey) {
      throw new Error('CENTRIFUGE_ADMIN_PRIVATE_KEY or WALLET_SEED is not set in environment variables');
    }

    console.log('🔗 Connecting to Centrifuge network...');
    const provider = new WsProvider(rpcUrl);
    const api = await ApiPromise.create({ provider });
    
    console.log('🔑 Setting up wallet...');
    const keyring = new Keyring({ type: 'sr25519' });
    
    // Handle different key formats
    let admin;
    try {
      if (privateKey.startsWith('0x')) {
        // Handle hex private key
        admin = keyring.addFromSeed(privateKey as any);
      } else if (privateKey.includes(' ')) {
        // Handle seed phrase
        admin = keyring.addFromMnemonic(privateKey);
      } else {
        // Handle URI format
        admin = keyring.addFromUri(privateKey);
      }
    } catch (keyError) {
      throw new Error(`Invalid private key format: ${keyError.message}`);
    }

    console.log('🎨 Creating NFT class...');
    const tx = api.tx.uniques?.create || api.tx.nfts?.create;
    
    if (!tx) {
      throw new Error('NFT creation not supported on this network');
    }

    // Create the NFT class/collection
    const createTx = api.tx.uniques.create(classId, admin.address);
    
    return new Promise((resolve, reject) => {
      createTx.signAndSend(admin, ({ status, events, dispatchError }) => {
        if (dispatchError) {
          if (dispatchError.isModule) {
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            reject(new Error(`${decoded.section}.${decoded.name}: ${decoded.docs}`));
          } else {
            reject(new Error(dispatchError.toString()));
          }
        } else if (status.isInBlock) {
          console.log(`✅ NFT Class created in block ${status.asInBlock.toString()}`);
          
          // Now mint the actual NFT
          const mintTx = api.tx.uniques.mint(classId, 0, admin.address);
          
          mintTx.signAndSend(admin, ({ status: mintStatus, events: mintEvents, dispatchError: mintError }) => {
            if (mintError) {
              if (mintError.isModule) {
                const decoded = api.registry.findMetaError(mintError.asModule);
                reject(new Error(`Mint failed: ${decoded.section}.${decoded.name}: ${decoded.docs}`));
              } else {
                reject(new Error(`Mint failed: ${mintError.toString()}`));
              }
            } else if (mintStatus.isInBlock) {
              console.log(`🎉 NFT minted successfully!`);
              console.log(`📍 Class ID: ${classId}`);
              console.log(`📍 Instance ID: 0`);
              console.log(`📍 Owner: ${admin.address}`);
              resolve({
                classId,
                instanceId: 0,
                owner: admin.address,
                blockHash: mintStatus.asInBlock.toString(),
                events: mintEvents
              });
            }
          }).catch(reject);
        }
      }).catch(reject);
    });

  } catch (error: any) {
    console.error('❌ NFT Minting Error:', error.message);
    throw error;
  }
}