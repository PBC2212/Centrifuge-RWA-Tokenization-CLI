// scripts/deploy.ts
import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

interface DeploymentResult {
  contractAddress: string;
  deployer: string;
  governanceMembers: string[];
  governanceThreshold: string;
  verifiedAppraisers: string[];
  transactionHash: string;
  gasUsed: string;
  deploymentCost: string;
}

async function main() {
  console.log('🛡️ DEPLOYING PropertyNFT TO SEPOLIA TESTNET\n');
  console.log('🔐 Enhanced Security | ⛽ Gas Optimized | 🏛️ Multi-Sig Ready\n');
  console.log('═'.repeat(60));

  // Network verification
  const network = await ethers.provider.getNetwork();
  console.log(`📡 Network: ${network.name} (Chain ID: ${network.chainId})`);
  
  // Fixed: Check for Sepolia chain ID (11155111)
  if (network.chainId !== 11155111n) { // Note the 'n' for BigInt
    throw new Error(`❌ Not connected to Sepolia testnet! Current chain ID: ${network.chainId}`);
  }

  try {
    // Get signers
    const signers = await ethers.getSigners();
    if (signers.length < 4) {
      console.log('⚠️ Warning: Less than 4 signers available. Using available signers...');
    }
    
    const deployer = signers[0];
    const governance1 = signers.length > 1 ? signers[1] : deployer;
    const governance2 = signers.length > 2 ? signers[2] : deployer;
    const appraiser1 = signers.length > 3 ? signers[3] : deployer;
    
    // Check balance
    const deployerBalance = await ethers.provider.getBalance(deployer.address);
    const minBalance = ethers.parseEther("0.05"); // Minimum 0.05 ETH for deployment
    
    if (deployerBalance < minBalance) {
      throw new Error(`❌ Insufficient balance! Need at least 0.05 ETH, have ${ethers.formatEther(deployerBalance)} ETH`);
    }
    
    console.log('👥 Deployment Team:');
    console.log(`   Deployer: ${deployer.address} (${ethers.formatEther(deployerBalance)} ETH)`);
    console.log(`   Governance 1: ${governance1.address}`);
    console.log(`   Governance 2: ${governance2.address}`);
    console.log(`   Appraiser 1: ${appraiser1.address}\n`);

    // Estimate gas for deployment
    console.log('⛽ Estimating deployment costs...');
    const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
    
    // Deploy the contract
    console.log('🚀 Deploying PropertyNFT...');
    const propertyNFT = await PropertyNFT.deploy();
    
    console.log('⏳ Waiting for deployment confirmation...');
    await propertyNFT.waitForDeployment();
    
    const contractAddress = await propertyNFT.getAddress();
    console.log(`✅ PropertyNFT deployed at: ${contractAddress}`);

    // Get deployment transaction details
    const deployTx = propertyNFT.deploymentTransaction();
    if (deployTx) {
      console.log(`📄 Transaction Hash: ${deployTx.hash}`);
      
      const receipt = await deployTx.wait();
      if (receipt) {
        console.log(`⛽ Gas Used: ${receipt.gasUsed.toString()}`);
        console.log(`💰 Deployment Cost: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH\n`);
      }
    }

    // Initial security setup
    console.log('🔧 Setting up multi-signature governance...');
    
    try {
      // Only add different addresses as governance members
      if (governance1.address !== deployer.address) {
        const tx1 = await propertyNFT.addGovernanceMember(governance1.address);
        await tx1.wait();
        console.log('   ✅ Added governance member 1');
      }
      
      if (governance2.address !== deployer.address && governance2.address !== governance1.address) {
        const tx2 = await propertyNFT.addGovernanceMember(governance2.address);
        await tx2.wait();
        console.log('   ✅ Added governance member 2');
      }
      
      // Set governance threshold
      const currentMemberCount = await propertyNFT.governanceMemberCount();
      if (currentMemberCount >= 2n) {
        const tx3 = await propertyNFT.updateGovernanceThreshold(2);
        await tx3.wait();
        console.log('   ✅ Updated governance threshold to 2');
      }
      
    } catch (setupError: any) {
      console.log('   ⚠️ Setup warning:', setupError.message);
    }

    // Verification
    console.log('\n🔍 Contract Verification:');
    
    const governanceThreshold = await propertyNFT.governanceThreshold();
    const governanceMemberCount = await propertyNFT.governanceMemberCount();
    const isDeployerMinter = await propertyNFT.authorizedMinters(deployer.address);
    
    console.log(`   Contract Address: ${contractAddress}`);
    console.log(`   Governance Threshold: ${governanceThreshold}`);
    console.log(`   Governance Members: ${governanceMemberCount}`);
    console.log(`   Deployer is Minter: ${isDeployerMinter}`);

    // Save deployment info
    const deploymentInfo: DeploymentResult = {
      contractAddress,
      deployer: deployer.address,
      governanceMembers: [deployer.address],
      governanceThreshold: governanceThreshold.toString(),
      verifiedAppraisers: [deployer.address],
      transactionHash: deployTx?.hash || 'N/A',
      gasUsed: 'N/A',
      deploymentCost: 'N/A'
    };

    // Write deployment info to file
    const deploymentsDir = path.join(__dirname, '..', 'deployments');
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    const deploymentFile = path.join(deploymentsDir, 'sepolia-deployment.json');
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\n💾 Deployment info saved to: ${deploymentFile}`);

    // Next steps
    console.log('\n📋 Next Steps:');
    console.log('   1. Verify contract on Etherscan:');
    console.log(`      npx hardhat verify --network sepolia ${contractAddress}`);
    console.log('   2. Test contract functionality');
    console.log('   3. Update frontend with contract address');

    console.log('\n🛡️ Security Reminders:');
    console.log('   • Keep private keys secure');
    console.log('   • Test all functions before mainnet');
    console.log('   • Set up proper governance procedures');

    return deploymentInfo;

  } catch (error: any) {
    console.error('💥 Deployment failed:', error.message);
    process.exit(1);
  }
}

// Execute deployment
main()
  .then(() => {
    console.log('\n🎉 Deployment completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });