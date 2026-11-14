/** Pad a GIF out to exactly `cap` bytes with a comment block. Does not change pixels. */
export function exactBytes(bytes: Uint8Array, cap: number): Uint8Array<ArrayBuffer> {
  if (bytes.byteLength > cap) throw new Error("Export came out over 14.9 MB.");
  if (bytes.byteLength === cap) {
    const same = new Uint8Array(bytes.byteLength);
    same.set(bytes);
    return same;
  }
  const out = new Uint8Array(cap);
  const hasTrailer = bytes.length > 0 && bytes[bytes.length - 1] === 0x3b;
  const bodyLen = hasTrailer ? bytes.length - 1 : bytes.length;
  const room = cap - bodyLen;
  if (!hasTrailer || room < 6) {
    out.set(bytes, 0);
    return out;
  }
  out.set(bytes.subarray(0, bodyLen), 0);
  let pos = bodyLen;
  out[pos++] = 0x21;
  out[pos++] = 0xfe;
  const termAt = cap - 2;
  while (termAt - pos > 256) {
    const chunk = termAt - pos - 256 === 1 ? 254 : 255;
    out[pos++] = chunk;
    pos += chunk;
  }
  const rest = termAt - pos;
  if (rest >= 2) {
    out[pos++] = rest - 1;
    pos += rest - 1;
  }
  out[termAt] = 0x00;
  out[cap - 1] = 0x3b;
  return out;
}
