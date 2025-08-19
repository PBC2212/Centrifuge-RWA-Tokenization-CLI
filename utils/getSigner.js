// utils/getSigner.js
const { ethers } = require("hardhat");
const fs = require("fs");

async function getSigner() {
  const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);

  if (process.env.WALLET_TYPE === "hardhat") {
    // Use one of Hardhat’s pre-funded test accounts
    const [signer] = await ethers.getSigners();
    console.log(`🔑 Using Hardhat signer: ${await signer.getAddress()}`);
    return signer;
  }

  if (process.env.ETHEREUM_KEYSTORE_PATH && process.env.ETHEREUM_KEYSTORE_PASSWORD) {
    // Load real keystore (mainnet / staging)
    const keystore = JSON.parse(fs.readFileSync(process.env.ETHEREUM_KEYSTORE_PATH, "utf8"));
    const wallet = await ethers.Wallet.fromEncryptedJson(
      JSON.stringify(keystore),
      process.env.ETHEREUM_KEYSTORE_PASSWORD
    );
    console.log(`🔑 Loaded keystore wallet: ${wallet.address}`);
    return wallet.connect(provider);
  }

  throw new Error("❌ No valid wallet configuration found. Check WALLET_TYPE or keystore settings.");
}

module.exports = { getSigner };
