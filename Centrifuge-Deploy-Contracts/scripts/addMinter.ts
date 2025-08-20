import { ethers } from "hardhat";

async function main() {
  // 👇 replace with your deployed contract address
  const nftAddress = "0x4741fbC7985853ca2c2685FaCB6a895CA30A31f5";

  // 👇 this will be your wallet address (the one you use in MetaMask)
  const walletToAuthorize = "0x7931edfa6255D59AEe5A65D26E6a7e3CF30E8339";

  // Load the contract
  const nft = await ethers.getContractAt("PropertyNFT", nftAddress);

  console.log("Authorizing:", walletToAuthorize);
  const tx = await nft.addAuthorizedMinter(walletToAuthorize);
  await tx.wait();

  console.log("✅ Authorized:", walletToAuthorize);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
