require("dotenv").config({ path: ".env.localfork" });
const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);

  // Use the first pre-funded account from Hardhat
  const signer = provider.getSigner(0);
  const address = await signer.getAddress();
  console.log("👤 Using signer:", address);

  // Tinlake Borrow contract (same as mainnet)
  const borrowAbi = [
    "function borrow(uint256 amount) external",
    "function repay(uint256 amount) external",
    "function debt(address usr) view returns (uint256)"
  ];
  const contract = new ethers.Contract(
    process.env.TINLAKE_BORROW_CONTRACT,
    borrowAbi,
    signer
  );

  // Check debt before
  let debt = await contract.debt(address);
  console.log("📊 Current debt:", ethers.utils.formatUnits(debt, 18), "DAI");

  // Borrow 1 DAI
  const tx = await contract.borrow(ethers.utils.parseUnits("1", 18));
  console.log("⏳ Borrowing...");
  await tx.wait();
  console.log("✅ Borrow TX:", tx.hash);

  // Check debt after borrow
  debt = await contract.debt(address);
  console.log("📊 New debt:", ethers.utils.formatUnits(debt, 18), "DAI");

  // Repay 1 DAI
  const repayTx = await contract.repay(ethers.utils.parseUnits("1", 18));
  console.log("⏳ Repaying...");
  await repayTx.wait();
  console.log("✅ Repay TX:", repayTx.hash);

  // Final debt
  debt = await contract.debt(address);
  console.log("📊 Final debt:", ethers.utils.formatUnits(debt, 18), "DAI");
}

main().catch(console.error);
