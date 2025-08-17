import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
const WALLET_DIR = path.join(process.cwd(), '.wallets');
const WALLET_FILE = path.join(WALLET_DIR, 'wallet.json');
export async function initWallet() {
    console.log('🔧 Initializing wallet...');
    if (!fs.existsSync(WALLET_DIR)) {
        fs.mkdirSync(WALLET_DIR, { recursive: true });
    }
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
    const { password } = await inquirer.prompt([{
            type: 'password',
            name: 'password',
            message: 'Enter password for wallet encryption:',
            validate: (input) => input.length >= 8 || 'Password must be at least 8 characters'
        }]);
    try {
        const wallet = ethers.Wallet.createRandom();
        const encryptedWallet = await wallet.encrypt(password);
        fs.writeFileSync(WALLET_FILE, encryptedWallet, 'utf8');
        console.log('✅ Wallet created successfully!');
        console.log(`📍 Address: ${wallet.address}`);
        console.log(`💾 Saved to: ${WALLET_FILE}`);
        console.log('⚠️  Keep your password safe - it cannot be recovered!');
    }
    catch (error) {
        console.error('❌ Error creating wallet:', error);
        throw error;
    }
}
