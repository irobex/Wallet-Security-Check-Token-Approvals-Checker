import { config } from "../../core/config.js";
import { logger } from "../../core/logger.js";
import { getEthProvider } from "../provider.js";
import { ERC20_IFACE } from "../erc20.js";
import type { ApprovalEvent, ApprovalEventProvider, ApprovalEventQuery } from "./types.js";

const approvalEvent = ERC20_IFACE.getEvent("Approval");
if (!approvalEvent) {
  throw new Error("ERC20 interface is missing Approval event ABI");
}
const APPROVAL_TOPIC = approvalEvent.topicHash;

function isRateLimitError(e: unknown): boolean {
  const msg = (e as any)?.message ?? (e as any)?.shortMessage ?? String(e);
  if (/Too Many Requests/i.test(msg) || /rate limit/i.test(msg) || (e as any)?.code === -32005) return true;
  const v = (e as any)?.value;
  if (Array.isArray(v)) {
    for (const item of v) {
      if (item?.code === -32005) return true;
      if (typeof item?.message === "string" && /Too Many Requests/i.test(item.message)) return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function topicOfAddress(addr: string): string {
  // 32-byte topic: left-padded address
  const a = addr.toLowerCase().replace(/^0x/, "");
  return "0x" + a.padStart(64, "0");
}

export class RpcApprovalEventProvider implements ApprovalEventProvider {
  async getApprovalEvents(query: ApprovalEventQuery): Promise<ApprovalEvent[]> {
    const provider = getEthProvider();
    const fromBlock = query.fromBlock;
    const toBlock = query.toBlock;

    const chunk = Number.isFinite(config.ethApprovalsChunkSize) ? config.ethApprovalsChunkSize : 50_000;
    const ownerTopic = topicOfAddress(query.owner);

    const events: ApprovalEvent[] = [];
    const blockTsCache = new Map<number, number>();

    for (let start = fromBlock; start <= toBlock; start += chunk) {
      const end = Math.min(toBlock, start + chunk - 1);
      logger.info(`eth_getLogs Approval(owner) blocks ${start}..${end}`);

      let logs: any[];
      for (let attempt = 0; ; attempt++) {
        try {
          logs = await provider.getLogs({
            fromBlock: start,
            toBlock: end,
            topics: [APPROVAL_TOPIC, ownerTopic]
          });
          break;
        } catch (e) {
          const msg = (e as any)?.shortMessage ?? (e as Error)?.message ?? String(e);
          logger.error(`eth_getLogs failed for blocks ${start}..${end} (attempt ${attempt + 1}): ${msg}`);
          if (isRateLimitError(e) && attempt < 6) {
            // Infura throttling: slow down aggressively.
            await sleep(5000 * (attempt + 1));
            continue;
          }
          throw e;
        }
      }

      // Throttle even on success to avoid hitting provider RPS limits.
      await sleep(1200);

      for (const log of logs) {
        const parsed = ERC20_IFACE.parseLog({ topics: log.topics as string[], data: log.data });
        if (!parsed) continue;

        const owner = String(parsed.args.owner);
        const spender = String(parsed.args.spender);
        const valueRaw = BigInt(parsed.args.value.toString());

        const ev: ApprovalEvent = {
          tokenAddress: log.address,
          owner,
          spender,
          valueRaw,
          blockNumber: log.blockNumber ?? 0,
          txHash: log.transactionHash ?? "",
          logIndex: log.index ?? 0
        };

        // best-effort timestamp
        if (ev.blockNumber) {
          const cached = blockTsCache.get(ev.blockNumber);
          if (cached !== undefined) {
            ev.timestampMs = cached;
          } else {
            try {
              const b = await provider.getBlock(ev.blockNumber);
              const tsMs = Number(b?.timestamp ?? 0) * 1000;
              blockTsCache.set(ev.blockNumber, tsMs);
              ev.timestampMs = tsMs;
            } catch {
              // ignore timestamp errors
            }
          }
        }

        events.push(ev);
      }
    }

    return events;
  }
}


