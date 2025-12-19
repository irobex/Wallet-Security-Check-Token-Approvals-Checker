export function buildRevokeLink(chainId: number, owner: string, _token: string, _spender: string): string {
  // MVP: provide a general revoke.cash link. Many revoke tools allow the user to paste token/spender manually.
  // We still include token/spender in the report line for easy copy/paste.
  if (chainId === 1) return `https://revoke.cash/address/${owner}`;
  return "https://revoke.cash";
}


