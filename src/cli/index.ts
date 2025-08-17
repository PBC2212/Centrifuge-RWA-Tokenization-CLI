// src/cli/index.ts
import { Command } from 'commander';
import inquirer from 'inquirer';
// Existing utils
import { initWallet } from '../utils/wallet.js';
import { checkBalance } from '../utils/balance.js';
import { listPools } from '../utils/pools.js';
import { checkDb } from '../utils/db.js';
// Asset utils
import { pledgeAsset, listAssets } from '../utils/assets.js';

const program = new Command();

program
  .name('centrifuge-rwa-cli')
  .description('CLI for RWA tokenization')
  .version('0.1.0');

// ✅ Init wallet command
program
  .command('init-wallet')
  .description('Initialize a new wallet')
  .action(async () => {
    try {
      await initWallet();
    } catch (err) {
      console.error('❌ Error initializing wallet:', err);
    }
  });

// ✅ Check balance command
program
  .command('check-balance')
  .description('Check wallet balance on a chain')
  .option('--chain <chain>', 'Chain to check (e.g. sepolia)')
  .action(async (options) => {
    try {
      await checkBalance(options.chain);
    } catch (err) {
      console.error('❌ Error checking balance:', err);
    }
  });

// ✅ List pools command
program
  .command('list-pools')
  .description('List available pools')
  .action(async () => {
    try {
      await listPools();
    } catch (err) {
      console.error('❌ Error listing pools:', err);
    }
  });

// ✅ Check database command
program
  .command('check-db')
  .description('Check database connection')
  .action(async () => {
    try {
      await checkDb();
    } catch (err) {
      console.error('❌ Error checking DB:', err);
    }
  });

// ✅ Pledge asset command
program
  .command('pledge-asset')
  .description('Pledge a new real-world asset')
  .action(async () => {
    const answers = await inquirer.prompt([
      { type: 'input', name: 'name', message: 'Asset name:' },
      { type: 'number', name: 'valueUsd', message: 'Asset value (USD):' },
      { type: 'input', name: 'documentPath', message: 'Path to supporting document (optional):' }
    ]);
    try {
      const asset = await pledgeAsset(
        answers.name,
        answers.valueUsd,
        answers.documentPath
      );
      console.log(`✅ Asset pledged successfully: ${asset.name} ($${asset.value_usd})`);
    } catch (err) {
      console.error('❌ Error pledging asset:', err);
    }
  });

// ✅ List assets command
program
  .command('list-assets')
  .description('List all pledged assets')
  .action(async () => {
    try {
      await listAssets();
    } catch (err) {
      console.error('❌ Error listing assets:', err);
    }
  });

program.parseAsync(process.argv);