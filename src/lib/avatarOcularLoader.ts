import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ownAvatarOcularImages } from './avatarOcular';
import { disposeThreeTree } from './threeResources';

const OCULAR_URL = '/assets/bodyforge-ocular-detail.glb';
const WIDTH = 384;
const HEIGHT = 192;
type OcularDocument = {
  buffers?: { uri?: string }[];
  images?: { bufferView?: number; uri?: string; mimeType?: string; name?: string }[];
  textures?: { source?: number; sampler?: number; extensions?: unknown; name?: string }[];
  samplers?: { magFilter?: number; minFilter?: number; wrapS?: number; wrapT?: number }[];
};

// This loader is intentionally specific to the published ocular donor.
// It must never silently accept external images or a different sampler.
function validateDocument(json: OcularDocument): void {
  const { buffers, images, textures, samplers } = json;
  const sampler = samplers?.[0];
  if (buffers?.length !== 1 || buffers[0].uri !== undefined ||
      images?.length !== 2 || textures?.length !== 2 || samplers?.length !== 1 ||
      sampler?.magFilter !== 9729 || sampler.minFilter !== 9987 ||
      sampler.wrapS !== 33071 || sampler.wrapT !== 33071 ||
      images.some(image => !image || image.uri !== undefined || image.mimeType !== 'image/png' ||
        !Number.isInteger(image.bufferView) || image.bufferView! < 0) ||
      images[0].bufferView === images[1].bufferView ||
      textures.some((texture, index) => !texture || texture.source !== index ||
        texture.sampler !== 0 || texture.extensions !== undefined)) {
    throw Error('Unsupported ocular texture document');
  }
}

export function checkOcularPng(bytes: ArrayBuffer): void {
  if (bytes.byteLength < 33 || bytes.byteLength > 64 * 1024) throw Error('Ocular PNG size');
  const view = new DataView(bytes);
  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a ||
      view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) {
    throw Error('Ocular PNG signature');
  }
  if (view.getUint32(16) !== WIDTH || view.getUint32(20) !== HEIGHT) {
    throw Error('Ocular PNG dimensions');
  }
}

async function decodeOcular(run: (loader: GLTFLoader) => Promise<GLTF>): Promise<GLTF> {
  const loader = new GLTFLoader();
  const pending = new Map<number, Promise<THREE.Texture>>();
  const owned = new Set<THREE.Texture>();
  const bitmaps = new Set<ImageBitmap>();
  let failed = false;
  let result: GLTF | undefined;
  const attachedTextures = new Set<THREE.Texture>();

  // Native GLTFLoader's ImageBitmapLoader fetches a blob: URL. Decode the
  // embedded PNG bytes directly instead, retaining glTF material assignment,
  // color spaces, geometry, UVs and the exact sampler of this donor.
  loader.register(parser => {
    const json = parser.json as OcularDocument;
    validateDocument(json);
    return {
      name: 'BODYFORGE_ocular_png',
      loadTexture(index: number) {
        if (failed || !Number.isInteger(index) || index < 0 || index >= 2) {
          return Promise.reject(Error('Invalid ocular texture index'));
        }
        const cached = pending.get(index);
        if (cached) return cached;
        const task = (async () => {
          const image = json.images![index];
          const bytes: unknown = await parser.getDependency('bufferView', image.bufferView!);
          if (!(bytes instanceof ArrayBuffer)) throw Error('Missing ocular PNG bytes');
          checkOcularPng(bytes);
          if (failed) throw Error('Ocular load cancelled');
          const blob = new Blob([bytes], { type: 'image/png' });
          let texture: THREE.Texture;
          if (typeof createImageBitmap === 'function') {
            const bitmap = await createImageBitmap(blob, {
              premultiplyAlpha: 'none', colorSpaceConversion: 'none',
            });
            bitmaps.add(bitmap);
            if (bitmap.width !== WIDTH || bitmap.height !== HEIGHT) throw Error('Ocular bitmap dimensions');
            texture = new THREE.Texture(bitmap);
          } else {
            // Legacy browser path: an image element reads the local object URL
            // without a fetch connection. Never change connect-src or globals.
            const url = URL.createObjectURL(blob);
            try {
              texture = await new THREE.TextureLoader().loadAsync(url);
            } finally {
              URL.revokeObjectURL(url);
            }
          }
          owned.add(texture);
          if (failed) throw Error('Ocular load cancelled');
          texture.name = json.textures![index].name ?? image.name ?? '';
          texture.flipY = false;
          texture.magFilter = THREE.LinearFilter;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.generateMipmaps = true;
          texture.userData.mimeType = 'image/png';
          texture.needsUpdate = true;
          parser.associations.set(texture, { textures: index });
          return texture;
        })();
        pending.set(index, task);
        return task;
      },
    };
  });

  try {
    result = await run(loader);
    // Verify that both decoded image sources are owned by the returned mesh
    // materials, including glTF texture clones that share the same source.
    const sources = new Set<unknown>();
    result.scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) {
            attachedTextures.add(value);
            sources.add(value.image);
          }
        }
      }
    });
    if (owned.size !== 2 || [...owned].some(texture => !sources.has(texture.image))) {
      throw Error('Incomplete ocular texture ownership');
    }
    ownAvatarOcularImages(result.scene);
    return result;
  } catch (error) {
    failed = true;
    // A material can fail while another image is still decoding. Wait for
    // those tasks before releasing each bitmap, including late completions.
    await Promise.allSettled(pending.values());
    if (result) disposeThreeTree(result.scene);
    owned.forEach(texture => { if (!attachedTextures.has(texture)) texture.dispose(); });
    bitmaps.forEach(bitmap => bitmap.close());
    throw error;
  }
}

export const loadAvatarOcularGltf = (): Promise<GLTF> =>
  decodeOcular(loader => loader.loadAsync(OCULAR_URL));

export const parseAvatarOcularGltf = (bytes: ArrayBuffer): Promise<GLTF> =>
  decodeOcular(loader => loader.parseAsync(bytes, ''));
