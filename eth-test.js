// eth-test.js
import dotenv from "dotenv";
import fs from "fs";
import { ethers } from "ethers";

dotenv.config({ path: ".env.production" });

const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
const keystorePath = process.env.ETHEREUM_KEYSTORE_PATH;
const keystorePassword = process.env.ETHEREUM_KEYSTORE_PASSWORD;

if (!keystorePath || !keystorePassword) {
  throw new Error("Missing ETHEREUM_KEYSTORE_PATH or ETHEREUM_KEYSTORE_PASSWORD in .env");
}

const keystore = fs.readFileSync(keystorePath, "utf8");

(async () => {
  try {
    const wallet = await ethers.Wallet.fromEncryptedJson(keystore, keystorePassword);
    const connectedWallet = wallet.connect(provider);

    console.log("✅ Wallet Address:", connectedWallet.address);

    const balance = await provider.getBalance(connectedWallet.address);
    console.log("💰 ETH Balance:", ethers.formatEther(balance), "ETH");
  } catch (err) {
    console.error("❌ Failed to load wallet:", err.message);
  }
})();
