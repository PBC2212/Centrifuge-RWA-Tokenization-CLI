import { Wallet } from "ethers";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// 🔧 Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Path to keystore.json (one folder up from scripts/)
  const keystorePath = path.resolve(__dirname, "../keystore.json");

  let keystore: string;
  try {
    keystore = await fs.readFile(keystorePath, "utf8");
  } catch (err) {
    throw new Error(`❌ No keystore file found at ${keystorePath}`);
  }

  const password = "Life2570%"; // your password
  const wallet = await Wallet.fromEncryptedJson(keystore, password);

  console.log("✅ Address:", wallet.address);
  console.log("🔑 Mnemonic:", wallet.mnemonic?.phrase ?? "⚠️ No mnemonic available");
}

main().catch(console.error);
