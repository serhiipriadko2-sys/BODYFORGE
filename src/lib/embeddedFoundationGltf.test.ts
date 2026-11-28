import { describe, expect, it } from 'vitest';
import { checkFoundationPng } from './embeddedFoundationGltf';

function header(w: number, h: number, length = 33): ArrayBuffer {
  const b = new ArrayBuffer(length), v = new DataView(b);
  v.setUint32(0, 0x89504e47);
  v.setUint32(4, 0x0d0a1a0a);
  v.setUint32(8, 13);
  v.setUint32(12, 0x49484452);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
}

describe('embedded foundation PNG preflight', () => {
  it('accepts a bounded embedded PNG header', () => {
    expect(() => checkFoundationPng(header(2048, 2048))).not.toThrow();
    expect(() => checkFoundationPng(header(4096, 4096))).not.toThrow();
  });
  it.each([[0, 1], [1, 0], [4097, 1], [1, 4097]])('rejects invalid %s x %s', (w, h) => {
    expect(() => checkFoundationPng(header(w, h))).toThrow('dimensions');
  });
  it('rejects truncated or oversized bytes before decoding', () => {
    expect(() => checkFoundationPng(new ArrayBuffer(32))).toThrow('size');
    expect(() => checkFoundationPng(header(1, 1, 16 * 1024 * 1024 + 1))).toThrow('size');
  });
  it('rejects bad signature or first chunk', () => {
    const b = header(8, 8), v = new DataView(b);
    v.setUint32(0, 0);
    expect(() => checkFoundationPng(b)).toThrow('signature');
    v.setUint32(0, 0x89504e47); v.setUint32(12, 0);
    expect(() => checkFoundationPng(b)).toThrow('signature');
  });
});
