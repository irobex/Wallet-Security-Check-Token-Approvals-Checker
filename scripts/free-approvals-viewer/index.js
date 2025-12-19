import { ethers } from "ethers";

const addr = process.argv[2]?.trim();
if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
  console.error("Usage: node index.js 0xYOUR_ETH_ADDRESS");
  process.exit(1);
}

const rpcUrl = process.env.ETH_RPC_URL;
if (!rpcUrl) {
  console.error("Missing ETH_RPC_URL env var. Example: ETH_RPC_URL=https://...");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(rpcUrl);

console.log("Wallet Guard — free preview (basic)");
console.log("Address:", addr);

// Intentionally minimal placeholder. In the paid bot we will:
// - find candidate token+spender pairs via Approval events
// - query allowance(owner, spender) for each pair
//
// For now, just sanity-check the RPC is reachable.
const block = await provider.getBlockNumber();
console.log("RPC OK. Latest block:", block);
console.log("\nFull approvals preview will be implemented later. Use Telegram bot for full report.");


