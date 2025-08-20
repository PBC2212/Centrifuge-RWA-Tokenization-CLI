// scripts/verify.ts
import { run } from 'hardhat';
import fs from 'fs';
import path from 'path';

async function verifyContract() {
  console.log('🔍 VERIFYING CONTRACT ON ETHERSCAN\n');
  console.log('═'.repeat(50));

  try {
    // Load deployment info
    const deploymentFile = path.join(__dirname, '..', 'deployments', 'sepolia-deployment.json');
    
    if (!fs.existsSync(deploymentFile)) {
      throw new Error('❌ Deployment file not found! Deploy the contract first.');
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    const contractAddress = deploymentInfo.contractAddress;

    console.log(`📍 Contract Address: ${contractAddress}`);
    console.log('⏳ Starting verification...\n');

    // Verify the contract
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: [], // PropertyNFT constructor has no arguments
      contract: "contracts/PropertyNFT.sol:PropertyNFT"
    });

    console.log('✅ Contract verification completed!');
    console.log(`🔗 View on Etherscan: https://sepolia.etherscan.io/address/${contractAddress}`);

  } catch (error: any) {
    if (error.message.includes('Already Verified')) {
      console.log('✅ Contract is already verified on Etherscan!');
    } else {
      console.error('❌ Verification failed:', error.message);
      console.log('\n💡 Troubleshooting:');
      console.log('   • Check if ETHERSCAN_API_KEY is set in .env');
      console.log('   • Ensure contract was deployed successfully');
      console.log('   • Wait a few minutes after deployment before verifying');
      console.log('   • Check if constructor arguments are correct');
    }
  }
}

verifyContract();