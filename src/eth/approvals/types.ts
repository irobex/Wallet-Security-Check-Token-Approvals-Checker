export type ApprovalEvent = {
  tokenAddress: string;
  owner: string;
  spender: string;
  valueRaw: bigint;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  timestampMs?: number;
};

export type ApprovalEventQuery = {
  chainId: number;
  owner: string;
  fromBlock: number;
  toBlock: number;
};

export interface ApprovalEventProvider {
  getApprovalEvents(query: ApprovalEventQuery): Promise<ApprovalEvent[]>;
}


