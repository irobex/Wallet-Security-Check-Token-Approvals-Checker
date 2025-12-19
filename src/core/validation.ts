export function isEthAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export function isZeroEthAddress(addr: string): boolean {
  return /^0x0{40}$/i.test(addr);
}


