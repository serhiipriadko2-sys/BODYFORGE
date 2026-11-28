import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

type EmbeddedImage = { bufferView?: number; uri?: string; mimeType?: string; name?: string };
type EmbeddedTexture = { source?: number; sampler?: number; extensions?: unknown; name?: string };
type EmbeddedSampler = { magFilter?: number; minFilter?: number; wrapS?: number; wrapT?: number };

// Pinned local foundation models only. Decode the actual embedded bytes instead
// of fetching a blob: URL. This preserves the application's connect-src policy.
export function checkFoundationPng(bytes: ArrayBuffer): void {
  if (bytes.byteLength < 33 || bytes.byteLength > 16 * 1024 * 1024) throw Error('Foundation PNG size');
  const v = new DataView(bytes);
  if (v.getUint32(0) !== 0x89504e47 || v.getUint32(4) !== 0x0d0a1a0a ||
      v.getUint32(8) !== 13 || v.getUint32(12) !== 0x49484452) throw Error('Foundation PNG signature');
  const width = v.getUint32(16), height = v.getUint32(20);
  if (!width || !height || width > 4096 || height > 4096 || width * height > 16777216) throw Error('Foundation PNG dimensions');
}

export async function parseEmbeddedFoundationGltf(bytes: ArrayBuffer): Promise<GLTF> {
  const owned = new Set<THREE.Texture>();
  const loader = new GLTFLoader();
  loader.register(parser => {
    const json = parser.json as { buffers?: { uri?: string }[]; images?: EmbeddedImage[];
      textures?: EmbeddedTexture[]; samplers?: EmbeddedSampler[] };
    if (json.buffers?.some(b => b.uri !== undefined) ||
        json.images?.some(i => i.uri !== undefined || i.mimeType !== 'image/png' ||
          !Number.isInteger(i.bufferView) || i.bufferView! < 0)) throw Error('Foundation must be self-contained');
    return {
      name: 'BODYFORGE_embedded_png',
      async loadTexture(index: number) {
        const def = json.textures?.[index], source = json.images?.[def?.source ?? -1];
        const sampler = def?.sampler === undefined ? {} : json.samplers?.[def.sampler];
        if (!def || !source || def.extensions || !sampler ||
            (sampler.magFilter !== undefined && sampler.magFilter !== 9729) ||
            (sampler.minFilter !== undefined && sampler.minFilter !== 9987) ||
            (sampler.wrapS !== undefined && sampler.wrapS !== 10497) ||
            (sampler.wrapT !== undefined && sampler.wrapT !== 10497)) throw Error('Unsupported foundation texture');
        const png: unknown = await parser.getDependency('bufferView', source.bufferView!);
        if (!(png instanceof ArrayBuffer)) throw Error('Missing foundation PNG');
        checkFoundationPng(png);
        const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }),
          { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        const texture = new THREE.Texture(bitmap);
        texture.name = def.name ?? source.name ?? '';
        texture.flipY = false;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.generateMipmaps = true;
        texture.userData.mimeType = 'image/png';
        texture.needsUpdate = true;
        owned.add(texture);
        texture.addEventListener('dispose', () => { owned.delete(texture); bitmap.close(); });
        parser.associations.set(texture, { textures: index });
        return texture;
      }
    };
  });
  try { return await loader.parseAsync(bytes, ''); }
  catch (error) { owned.forEach(texture => texture.dispose()); throw error; }
}
