import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
const size = 256;
const raw = Buffer.alloc((size * 4 + 1) * size);
const rounded = (x, y, left, top, w, h, r) => {
  const dx = Math.max(left + r - x, 0, x - (left + w - r));
  const dy = Math.max(top + r - y, 0, y - (top + h - r));
  return x >= left && x < left + w && y >= top && y < top + h && dx * dx + dy * dy <= r * r;
};
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const at = y * (size * 4 + 1) + x * 4 + 1;
  if (!rounded(x, y, 8, 8, 240, 240, 64)) continue;
  const t = (x + y) / 512;
  let c = [154 + t * 27, 143 + t * 24, 211 + t * 23, 255];
  if (rounded(x, y, 51, 58, 65, 82, 20) || rounded(x, y, 131, 58, 74, 44, 18) || rounded(x, y, 131, 117, 74, 81, 20) || rounded(x, y, 51, 155, 65, 43, 17)) c = [255, 255, 255, 245];
  c.forEach((v, i) => raw[at + i] = v);
}
function crc32(buf) { let c = 0xffffffff; for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type); const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8); return out; }
const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
mkdirSync('assets', { recursive: true }); writeFileSync('assets/app.png', png);
const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico[6] = 0; ico[7] = 0; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
writeFileSync('assets/app.ico', Buffer.concat([ico, png]));
