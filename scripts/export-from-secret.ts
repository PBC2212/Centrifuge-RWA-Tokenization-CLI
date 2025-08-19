import { Wallet } from "ethers";
import * as fs from "fs";

async function main() {
  // Your raw secret/private key (add 0x prefix)
  const privateKey = "0x8A2E6B0E3F219C94DCD4B8F25AAE1B5C5E7F9C1D7F928A3F94E6E502AA34BC12";

  // Load into ethers wallet
  const wallet = new Wallet(privateKey);

  console.log("✅ Address:", wallet.address);

  // Choose a password to protect the keystore (remember this!)
  const password = "Life2570%";

  // Export into UTC-- keystore JSON format
  const keystore = await wallet.encrypt(password);

  // Save to file
  fs.writeFileSync("keystore.json", keystore);

  console.log("✅ Keystore saved as keystore.json");
}

main().catch(console.error);
