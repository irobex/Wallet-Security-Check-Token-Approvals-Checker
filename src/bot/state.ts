export type UserSession = {
  mode?: "IDLE" | "WAITING_WALLET";
  walletAddress?: string;
  lastOrderId?: string;
};


