// src/utils/wallet.ts
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';

const WALLET_DIR = path.join(process.cwd(), '.wallets');
const WALLET_FILE = path.join(WALLET_DIR, 'wallet.json');

export async function initWallet(): Promise<void> {
  console.log('🔧 Initializing wallet...');
  
  // Create wallet directory if it doesn't exist
  if (!fs.existsSync(WALLET_DIR)) {
    fs.mkdirSync(WALLET_DIR, { recursive: true });
  }

  // Check if wallet already exists
  if (fs.existsSync(WALLET_FILE)) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'Wallet already exists. Overwrite?',
      default: false
    }]);
    
    if (!overwrite) {
      console.log('❌ Wallet initialization cancelled.');
      return;
    }
  }

  // Get password
  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: 'Enter password for wallet encryption:',
    validate: (input: string) => input.length >= 8 || 'Password must be at least 8 characters'
  }]);

  try {
    // Generate new wallet
    const wallet = ethers.Wallet.createRandom();
    
    // Encrypt wallet
    const encryptedWallet = await wallet.encrypt(password);
    
    // Save encrypted wallet
    fs.writeFileSync(WALLET_FILE, encryptedWallet, 'utf8');
    
    console.log('✅ Wallet created successfully!');
    console.log(`📍 Address: ${wallet.address}`);
    console.log(`💾 Saved to: ${WALLET_FILE}`);
    console.log('⚠️  Keep your password safe - it cannot be recovered!');
    
  } catch (error) {
    console.error('❌ Error creating wallet:', error);
    throw error;
  }
}