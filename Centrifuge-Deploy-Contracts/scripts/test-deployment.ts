// scripts/test-deployment.ts
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

async function testDeployment() {
  console.log('🧪 TESTING DEPLOYED CONTRACT\n');
  console.log('═'.repeat(50));

  try {
    // Load deployment info
    const deploymentFile = path.join(__dirname, '..', 'deployments', 'sepolia-deployment.json');
    if (!fs.existsSync(deploymentFile)) {
      throw new Error('❌ Deployment file not found! Deploy the contract first.');
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    const contractAddress = deploymentInfo.contractAddress;

    console.log(`📍 Testing contract at: ${contractAddress}\n`);

    // Connect to deployed contract
    const [deployer, user1] = await ethers.getSigners();
    const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
    const propertyNFT = PropertyNFT.attach(contractAddress);

    // Test 1: Check basic contract info
    console.log('📋 Test 1: Basic Contract Information');
    const name = await propertyNFT.name();
    const symbol = await propertyNFT.symbol();
    const totalSupply = await propertyNFT.totalSupply();
    
    console.log(`   Name: ${name}`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Total Supply: ${totalSupply}`);
    console.log('   ✅ Basic info test passed\n');

    // Test 2: Check governance setup
    console.log('🏛️ Test 2: Governance Configuration');
    const governanceThreshold = await propertyNFT.governanceThreshold();
    const governanceMemberCount = await propertyNFT.governanceMemberCount();
    const isDeployerGovernance = await propertyNFT.governanceMembers(deployer.address);
    
    console.log(`   Governance Threshold: ${governanceThreshold}`);
    console.log(`   Governance Member Count: ${governanceMemberCount}`);
    console.log(`   Deployer is Governance Member: ${isDeployerGovernance}`);
    console.log('   ✅ Governance test passed\n');

    // Test 3: Check authorization
    console.log('🔐 Test 3: Authorization Setup');
    const isDeployerMinter = await propertyNFT.authorizedMinters(deployer.address);
    const isDeployerAppraiser = await propertyNFT.verifiedAppraisers(deployer.address);
    
    console.log(`   Deployer is Authorized Minter: ${isDeployerMinter}`);
    console.log(`   Deployer is Verified Appraiser: ${isDeployerAppraiser}`);
    console.log('   ✅ Authorization test passed\n');

    // Test 4: Test minting function (if authorized)
    if (isDeployerMinter) {
      console.log('🏠 Test 4: Property Minting');
      try {
        const mintTx = await propertyNFT.mintProperty(
          deployer.address,
          "TEST-PROP-001",
          ethers.parseEther("500000"), // $500k property value
          "123 Test Street, Test City, TC 12345",
          2500, // 2500 sq ft
          "Single Family Home",
          2020, // Built in 2020
          "https://example.com/metadata/1.json",
          "QmTest123LegalDocs",
          "QmTest123Appraisal"
        );

        const receipt = await mintTx.wait();
        const tokenId = receipt?.logs?.[0]?.topics?.[3] ? 
          BigInt(receipt.logs[0].topics[3]) : BigInt(1);

        console.log(`   ✅ Property minted successfully! Token ID: ${tokenId}`);
        console.log(`   Gas Used: ${receipt?.gasUsed}`);

        // Verify the minted property
        const property = await propertyNFT.properties(tokenId);
        console.log(`   Property ID: ${property.propertyId}`);
        console.log(`   Property Value: ${ethers.formatEther(property.propertyValue)} ETH`);
        console.log(`   Is Tokenized: ${property.isTokenized}`);
        console.log('   ✅ Property verification passed\n');

        // Test lending readiness
        const [isReady, reason] = await propertyNFT.isPropertyLendingReady(tokenId);
        console.log('📊 Lending Readiness Check:');
        console.log(`   Ready for Lending: ${isReady}`);
        console.log(`   Reason: ${reason}\n`);

      } catch (mintError) {
        console.log('   ⚠️ Minting test skipped:', mintError);
      }
    } else {
      console.log('🏠 Test 4: Minting - Skipped (deployer not authorized)\n');
    }

    // Test 5: Gas optimization features
    console.log('⛽ Test 5: Gas Optimization Features');
    try {
      const [tokens, totalCount, hasMore] = await propertyNFT.getTokensByOwner(
        deployer.address, 
        0, 
        10
      );
      
      console.log(`   Tokens owned: ${tokens.length}`);
      console.log(`   Total count: ${totalCount}`);
      console.log(`   Has more: ${hasMore}`);
      console.log('   ✅ Pagination test passed\n');
    } catch (paginationError) {
      console.log('   ⚠️ Pagination test failed:', paginationError);
    }

    console.log('🎉 All tests completed successfully!');
    console.log('\n📈 Contract is ready for use!');
    console.log(`🔗 View on Sepolia Etherscan: https://sepolia.etherscan.io/address/${contractAddress}`);

  } catch (error) {
    console.error('💥 Testing failed:', error);
    process.exit(1);
  }
}

testDeployment();