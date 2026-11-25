import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

function png(path: string) {
  const bytes = readFileSync(path), chunks: Buffer[] = [];
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (bytes[24] !== 8 || ![2, 6].includes(bytes[25]) || bytes[28] !== 0) throw Error('Expected non-interlaced 8-bit RGB(A) PNG');
  const channels = bytes[25] === 2 ? 3 : 4, stride = width * channels;
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), pixels = new Uint8Array(height * stride);
  if (raw.length !== height * (stride + 1)) throw Error('Invalid decoded PNG size');
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
    return x <= y && x <= z ? a : y <= z ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw Error('Unknown PNG filter');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= channels ? pixels[i - channels] : 0;
      const b = y ? pixels[i - stride] : 0, c = y && x >= channels ? pixels[i - stride - channels] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c);
      pixels[i] = (raw[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  return { bytes, width, height, channels, pixels };
}

describe('Blender high-to-low facial normal atlas', () => {
  it('exists as a real local atlas rather than a promised placeholder', () => {
    expect(existsSync('public/assets/athlete-face-relief-normal.png')).toBe(true);
  });
  it('contains bounded numerical normals and preserves most original texels exactly', () => {
    if (!existsSync('public/assets/athlete-face-relief-normal.png')) return;
    const baked = png('public/assets/athlete-face-relief-normal.png');
    const original = png('public/assets/athlete-normal.png');
    expect([baked.width, baked.height, baked.channels]).toEqual([1024, 1024, 3]);
    expect([original.width, original.height]).toEqual([1024, 1024]);
    expect(createHash('sha256').update(original.bytes).digest('hex')).toBe('e95565df62af0349a6bfeb266f505ee23e0789bcb3f83fee0ae9c84c718ed67c');
    expect(baked.bytes.length).toBeLessThan(700000);
    let changed = 0, maxLengthError = 0, minZ = 1;
    for (let y = 0; y < baked.height; y++) for (let x = 0; x < baked.width; x++) {
      const i = (y * baked.width + x) * 3, j = (y * original.width + x) * original.channels;
      if (baked.pixels[i] !== original.pixels[j] || baked.pixels[i+1] !== original.pixels[j+1] || baked.pixels[i+2] !== original.pixels[j+2]) changed++;
      const nx = baked.pixels[i] / 127.5 - 1, ny = baked.pixels[i+1] / 127.5 - 1, nz = baked.pixels[i+2] / 127.5 - 1;
      maxLengthError = Math.max(maxLengthError, Math.abs(Math.hypot(nx, ny, nz) - 1));
      minZ = Math.min(minZ, nz);
    }
    expect(changed).toBeGreaterThan(10000);
    expect(changed).toBeLessThan(1024 * 1024 * .06);
    expect(maxLengthError).toBeLessThan(.03);
    expect(minZ).toBeGreaterThan(.3);
    console.info('FACE_ATLAS_QC', JSON.stringify({ changed, maxLengthError, minZ, bytes: baked.bytes.length }));
  });
});
