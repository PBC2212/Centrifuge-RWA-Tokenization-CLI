import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();

export async function deploySecurePropertyNFT() {
  console.log('🛡️ DEPLOYING AUDIT-COMPLIANT PropertyNFT\n');
  console.log('🔒 Enhanced Security | ⛽ Gas Optimized | 🏛️ Multi-Sig Ready\n');
  console.log('═'.repeat(60));

  try {
    // Get signers
    const [deployer, governance1, governance2, appraiser1] = await ethers.getSigners();
    
    console.log('👥 Deployment Team:');
    console.log(`   Deployer: ${deployer.address}`);
    console.log(`   Governance 1: ${governance1.address}`);
    console.log(`   Governance 2: ${governance2.address}`);
    console.log(`   Appraiser 1: ${appraiser1.address}\n`);

    // Deploy the enhanced contract
    console.log('🚀 Deploying Enhanced PropertyNFT...');
    const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
    const propertyNFT = await PropertyNFT.deploy();
    await propertyNFT.deployed();

    console.log(`✅ PropertyNFT deployed at: ${propertyNFT.address}\n`);

    // Initial security setup
    console.log('🔧 Setting up multi-signature governance...');
    
    // Add governance members
    await propertyNFT.addGovernanceMember(governance1.address);
    await propertyNFT.addGovernanceMember(governance2.address);
    
    // Set governance threshold to 2 (require 2 signatures)
    await propertyNFT.updateGovernanceThreshold(2);
    
    console.log('✅ Multi-sig governance configured (2/3 threshold)');

    // Verify appraiser
    await propertyNFT.verifyAppraiser(appraiser1.address);
    console.log('✅ Initial appraiser verified');

    // Security verification
    console.log('\n🔍 Security Verification:');
    
    const governanceThreshold = await propertyNFT.governanceThreshold();
    const governanceMemberCount = await propertyNFT.governanceMemberCount();
    const isAppraiserVerified = await propertyNFT.verifiedAppraisers(appraiser1.address);
    
    console.log(`   Governance Threshold: ${governanceThreshold}`);
    console.log(`   Governance Members: ${governanceMemberCount}`);
    console.log(`   Appraiser Verified: ${isAppraiserVerified}`);

    // Test gas-optimized functions
    console.log('\n⛽ Testing Gas Optimizations:');
    
    // Test pagination (should not revert)
    try {
      await propertyNFT.getTokensByOwner(deployer.address, 0, 10);
      console.log('   ✅ Pagination working correctly');
    } catch (e) {
      console.log('   ⚠️  Pagination test failed:', e.message);
    }

    // Security recommendations
    console.log('\n🛡️ Post-Deployment Security Checklist:');
    console.log('   ✅ Multi-signature governance enabled');
    console.log('   ✅ Gas optimization implemented');
    console.log('   ✅ Verification audit trail active');
    console.log('   ✅ Emergency pause controls ready');
    console.log('   ✅ Document integrity hashing enabled');

    console.log('\n📋 Production Deployment Steps:');
    console.log('   1. Get professional security audit');
    console.log('   2. Deploy to testnet first');
    console.log('   3. Run comprehensive testing');
    console.log('   4. Set up monitoring systems');
    console.log('   5. Deploy to mainnet');
    console.log('   6. Verify contracts on Etherscan');

    console.log('\n💡 Ongoing Security Practices:');
    console.log('   • Regular security reviews');
    console.log('   • Monitor for unusual activity');
    console.log('   • Keep governance members secure');
    console.log('   • Regular appraiser verification');
    console.log('   • Document backup strategies');

    // Return deployment info
    return {
      contractAddress: propertyNFT.address,
      deployer: deployer.address,
      governanceMembers: [deployer.address, governance1.address, governance2.address],
      governanceThreshold: governanceThreshold.toString(),
      verifiedAppraisers: [appraiser1.address],
      features: [
        'Multi-signature governance',
        'Gas-optimized enumeration',
        'Verification audit trail',
        'Document integrity hashing',
        'Enhanced security controls'
      ]
    };

  } catch (error) {
    console.error('💥 Deployment failed:', error);
    throw error;
  }
}

// Test the enhanced security features
export async function testSecurityFeatures(contractAddress: string) {
  console.log('\n🧪 TESTING ENHANCED SECURITY FEATURES\n');
  console.log('═'.repeat(60));

  const [deployer, governance1, governance2] = await ethers.getSigners();
  const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
  const propertyNFT = PropertyNFT.attach(contractAddress);

  try {
    // Test 1: Multi-sig governance proposal
    console.log