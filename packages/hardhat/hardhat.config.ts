// Adapted from hedera-dev/scaffold-hbar blank baseline; see docs/baseline.md.
import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-ethers";

// Use the lockfile-pinned compiler: deterministic checks require no compiler CDN.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(
  async ({ solcVersion }, _hre, runSuper) => {
    if (solcVersion !== "0.8.28") return runSuper();
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: "0.8.28",
      longVersion: "0.8.28+commit.7893614a",
    };
  },
);
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: { chainId: 31337 },
    hederaTestnet: {
      chainId: 296,
      url: process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api",
      accounts: [],
    },
  },
};
export default config;
