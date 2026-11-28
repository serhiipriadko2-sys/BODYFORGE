import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkOcularPng, parseAvatarOcularGltf } from './avatarOcularLoader';
import { disposeThreeTree } from './threeResources';

const donor = readFileSync('public/assets/bodyforge-ocular-detail.glb');
const bytes = () => Uint8Array.from(donor).buffer;

function altered(change: (doc: Record<string, any>) => void): ArrayBuffer {
  const size = donor.readUInt32LE(12);
  const doc = JSON.parse(donor.toString('utf8', 20, 20 + size));
  change(doc);
  const text = JSON.stringify(doc);
  const json = Buffer.from(text.padEnd((text.length + 3) & ~3, ' '));
  const tail = donor.subarray(20 + size);
  const head = Buffer.from(donor.subarray(0, 20));
  head.writeUInt32LE(20 + json.length + tail.length, 8);
  head.writeUInt32LE(json.length, 12);
  return Uint8Array.from(Buffer.concat([head, json, tail])).buffer;
}

class Bitmap {
  closes = 0;
  constructor(readonly width = 384, readonly height = 192) {}
  close() { this.closes++; }
}
function decoder() {
  const images: Bitmap[] = [];
  const decode = vi.fn(async (_blob: Blob, _options: ImageBitmapOptions) => {
    const image = new Bitmap();
    images.push(image);
    return image as unknown as ImageBitmap;
  });
  vi.stubGlobal('ImageBitmap', Bitmap);
  vi.stubGlobal('createImageBitmap', decode);
  return { images, decode };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CSP-safe published ocular GLB', () => {
  it('decodes both real embedded PNG buffers without a fetch or object URL', async () => {
    const { images, decode } = decoder();
    const fetch = vi.fn(() => Promise.reject(Error('Unexpected network request')));
    vi.stubGlobal('fetch', fetch);
    const objectUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw Error('Unexpected object URL');
    });
    const result = await parseAvatarOcularGltf(bytes());
    try {
      expect(decode).toHaveBeenCalledTimes(2);
      expect(fetch).not.toHaveBeenCalled();
      expect(objectUrl).not.toHaveBeenCalled();
      expect(decode.mock.calls.map(([blob]) => blob.size).sort((a, b) => a - b)).toEqual([7841, 39751]);
      for (const [blob, options] of decode.mock.calls) {
        expect(blob.type).toBe('image/png');
        checkOcularPng(await blob.arrayBuffer());
        expect(options).toEqual({ premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      }
      const mesh = result.scene.children[0] as THREE.Mesh;
      const material = mesh.material as THREE.MeshPhysicalMaterial;
      expect(mesh.name).toBe('BODYFORGE_OcularDetail');
      expect(mesh.geometry.getAttribute('position').count).toBe(1076);
      expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
      expect(material.ior).toBeCloseTo(1.376);
      expect(material.specularIntensity).toBeCloseTo(.42);
      expect(material.clearcoat).toBeCloseTo(.42);
      expect(material.clearcoatRoughness).toBeCloseTo(.62);
      expect(material.map).not.toBeNull();
      expect(material.roughnessMap).not.toBeNull();
      expect(material.clearcoatMap).not.toBeNull();
      expect(material.clearcoatRoughnessMap).not.toBeNull();
      expect(material.map?.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(material.roughnessMap?.colorSpace).toBe(THREE.NoColorSpace);
      expect(material.roughnessMap?.image).toBe(material.clearcoatMap?.image);
      expect(material.clearcoatRoughnessMap?.image).toBe(material.roughnessMap?.image);
      for (const texture of [material.map!, material.roughnessMap!, material.clearcoatMap!, material.clearcoatRoughnessMap!]) {
        expect(texture.flipY).toBe(false);
        expect(texture.magFilter).toBe(THREE.LinearFilter);
        expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
        expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
        expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
        expect(texture.generateMipmaps).toBe(true);
        expect(texture.userData.mimeType).toBe('image/png');
      }
      expect(images.every(image => image.closes === 0)).toBe(true);
    } finally { disposeThreeTree(result.scene); }
    expect(images.map(image => image.closes)).toEqual([1, 1]);
  });

  it.each([
    ['external image', (doc: Record<string, any>) => { doc.images[0].uri = 'https://invalid.example/eye.png'; }],
    ['external buffer', (doc: Record<string, any>) => { doc.buffers[0].uri = 'https://invalid.example/eye.bin'; }],
    ['wrong sampler', (doc: Record<string, any>) => { doc.samplers[0].wrapS = 10497; }],
    ['unsupported MIME', (doc: Record<string, any>) => { doc.images[0].mimeType = 'image/jpeg'; }],
    ['reused source', (doc: Record<string, any>) => { doc.textures[1].source = 0; }],
  ] as const)('rejects %s before decoding or network requests', async (_label, change) => {
    const { decode } = decoder();
    const fetch = vi.fn(() => Promise.reject(Error('Unexpected network request')));
    vi.stubGlobal('fetch', fetch);
    await expect(parseAvatarOcularGltf(altered(change))).rejects.toThrow('Unsupported ocular texture document');
    expect(decode).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects malformed or oversized PNG headers', () => {
    expect(() => checkOcularPng(new ArrayBuffer(32))).toThrow('size');
    expect(() => checkOcularPng(new ArrayBuffer(65537))).toThrow('size');
    expect(() => checkOcularPng(new ArrayBuffer(33))).toThrow('signature');
    const header = new ArrayBuffer(33), v = new DataView(header);
    v.setUint32(0, 0x89504e47); v.setUint32(4, 0x0d0a1a0a);
    v.setUint32(8, 13); v.setUint32(12, 0x49484452);
    v.setUint32(16, 385); v.setUint32(20, 192);
    expect(() => checkOcularPng(header)).toThrow('dimensions');
  });

  it('releases late-completing bitmaps after another image fails', async () => {
    const image = new Bitmap();
    vi.stubGlobal('ImageBitmap', Bitmap);
    vi.stubGlobal('createImageBitmap', vi.fn(async (blob: Blob) => {
      if (blob.size === 7841) throw Error('Synthetic decode error');
      await new Promise(resolve => setTimeout(resolve, 15));
      return image as unknown as ImageBitmap;
    }));
    await expect(parseAvatarOcularGltf(bytes())).rejects.toThrow('Synthetic decode error');
    expect(image.closes).toBe(1);
  });

  it('closes the bitmap if decoded dimensions contradict the PNG header', async () => {
    const images = [new Bitmap(385, 192), new Bitmap()];
    let index = 0;
    vi.stubGlobal('ImageBitmap', Bitmap);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => images[index++] as unknown as ImageBitmap));
    await expect(parseAvatarOcularGltf(bytes())).rejects.toThrow('Ocular bitmap dimensions');
    expect(images.map(image => image.closes)).toEqual([1, 1]);
  });

  it('retains the legacy image-element path without leaking object URLs', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const made: string[] = [];
    const make = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = 'blob:ocular-fixture-' + made.length;
      made.push(url);
      return url;
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(async () =>
      new THREE.Texture({ width: 384, height: 192 } as HTMLImageElement));
    const result = await parseAvatarOcularGltf(bytes());
    try {
      expect(make).toHaveBeenCalledTimes(2);
      expect(load).toHaveBeenCalledTimes(2);
      expect(revoke.mock.calls.map(([url]) => url).sort()).toEqual(made.sort());
    } finally { disposeThreeTree(result.scene); }
  });
});
