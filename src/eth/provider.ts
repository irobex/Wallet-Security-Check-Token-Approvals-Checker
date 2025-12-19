import { JsonRpcProvider } from "ethers";
import { config } from "../core/config.js";

let _provider: JsonRpcProvider | null = null;

export function getEthProvider(): JsonRpcProvider {
  if (_provider) return _provider;
  if (!config.ethRpcUrl) throw new Error("ETH_RPC_URL is required for Ethereum RPC calls.");
  _provider = new JsonRpcProvider(config.ethRpcUrl);
  return _provider;
}


