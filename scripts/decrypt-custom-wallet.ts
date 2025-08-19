import { promises as fs } from "fs";
import crypto from "crypto";
import argon2 from "argon2";
import { Wallet } from "ethers";

async function main() {
  const password = "Life2570%"; // your password
  const walletFile = "./keystore.json"; // renamed wallet.json

  // Load file
  const data = JSON.parse(await fs.readFile(walletFile, "utf8"));
  const { encrypted, salt, iv } = data.encryptedPrivateKey;

  // Derive key with argon2id
  const derivedKey = await argon2.hash(password, {
    type: argon2.argon2id,
    salt: Buffer.from(salt, "hex"),
    hashLength: 32,
    raw: true,
  });

  // Decrypt with AES-256-GCM
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    derivedKey,
    Buffer.from(iv, "hex")
  );

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "hex")),
    decipher.final(),
  ]);

  const privateKey = decrypted.toString("hex");
  const wallet = new Wallet(privateKey);

  console.log("✅ Address:", wallet.address);
  console.log("🔑 Private Key:", privateKey);

  if (wallet.mnemonic) {
    console.log("🌱 Mnemonic:", wallet.mnemonic.phrase);
  } else {
    console.log("⚠️ This wallet has no mnemonic (only private key).");
  }
}

main().catch(console.error);
