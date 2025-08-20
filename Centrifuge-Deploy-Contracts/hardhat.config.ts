import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20", // Updated to newer version that handles stack depth better
    settings: {
      optimizer: {
        enabled: true,
        runs: 800, // Reduced runs for better stack handling
        details: {
          yul: true,
          yulDetails: {
            stackAllocation: true,
          },
        },
      },
      viaIR: true, // Enable intermediate representation
      evmVersion: "paris", // Use latest EVM version
    },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gas: 8000000, // Increased gas limit
      gasPrice: 10000000000, // Reduced to 10 gwei (was 20)
      timeout: 60000, // 60 seconds timeout
    },
    hardhat: {
      gas: 12000000,
      blockGasLimit: 12000000,
      allowUnlimitedContractSize: true,
      accounts: {
        count: 10,
        accountsBalance: "10000000000000000000000", // 10k ETH
      },
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  mocha: {
    timeout: 60000, // 60 seconds
  },
};

export default config;