// Mosaic helper functions (REQ-4)
// Based on ETS 300 706 G1 mosaic character encoding

// Encode a 6-bit block mask to a G1 mosaic byte
// Bit positions: TL=1, TR=2, ML=4, MR=8, LL=16, LR=32
// Formula: 0x20 | (mask & 0x1F) | (mask & 0x20 ? 0x40 : 0)
export function encodeBlockMask(mask: number): number {
  return 0x20 | (mask & 0x1F) | ((mask & 0x20) ? 0x40 : 0);
}

// Decode a G1 mosaic byte to a 6-bit block mask
// Inverse of encodeBlockMask
export function decodeBlockMask(byte: number): number {
  return (byte & 0x1F) | ((byte & 0x40) ? 0x20 : 0);
}
