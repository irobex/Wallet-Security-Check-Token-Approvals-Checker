import { Contract, Interface } from "ethers";
import { getEthProvider } from "./provider.js";

export const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
] as const;

export const ERC20_IFACE = new Interface(ERC20_ABI);

export function getErc20Contract(tokenAddress: string): Contract {
  return new Contract(tokenAddress, ERC20_ABI, getEthProvider());
}


