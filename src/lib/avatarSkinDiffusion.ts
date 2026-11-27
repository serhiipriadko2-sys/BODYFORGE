import * as THREE from 'three';

export const DIFFUSION_REVIEW_ID = 'BF_SKIN_ANGULAR_DIFFUSION_V1';
export const DIFFUSION_WIDTH = 129;
export const DIFFUSION_HEIGHT = 33;
const channels = [1.05, .65, .36] as const;
const QUADRATURE = 32;

/** Average max(0, a+b*cos(phi)) around one ring, integrated analytically. */
function ring(a: number, b: number): number {
  if (b < 1e-12 || a >= b) return Math.max(0, a);
  if (a <= -b) return 0;
  const h = Math.acos(-a / b);
  return (a * h + b * Math.sin(h)) / Math.PI;
}

/** Uniform solid-angle cap convolution of Lambertian irradiance.
 * A normalized, rotationally symmetric kernel preserves the angular mean
 * of Lambert's cosine response (1/4 over the whole sphere).
 * This is a local angular diffusion surrogate, not a measured BSSRDF. */
export function diffuseCap(mu: number, radius: number): number {
  const x = THREE.MathUtils.clamp(mu, -1, 1);
  if (radius <= 1e-6) return Math.max(0, x);
  const c0 = Math.cos(radius), transverse = Math.sqrt(Math.max(0, 1 - x * x));
  let sum = 0;
  for (let i = 0; i < QUADRATURE; i++) {
    // Uniform in cos(theta), hence uniform in solid angle, not in angle.
    const c = c0 + (1 - c0) * (i + .5) / QUADRATURE;
    sum += ring(x * c, transverse * Math.sqrt(Math.max(0, 1 - c * c)));
  }
  return sum / QUADRATURE;
}

/** Artistic RGB angular widths, inspired by wavelength-dependent diffusion.
 * Broad red, medium green, narrow blue. No clinical/calibrated skin claim. */
export function sampleSkinAngularDiffusion(mu: number, spread: number): readonly [number, number, number] {
  const s = THREE.MathUtils.clamp(spread, 0, 1);
  return channels.map(maxRadius => {
    const radius = s * maxRadius;
    return .35 * diffuseCap(mu, radius * .42) + .65 * diffuseCap(mu, radius);
  }) as unknown as readonly [number, number, number];
}

let packed: Uint8Array | undefined;
export function skinDiffusionPixels(): Uint8Array {
  if (!packed) {
    const bytes = new Uint8Array(DIFFUSION_WIDTH * DIFFUSION_HEIGHT * 4);
    for (let y = 0; y < DIFFUSION_HEIGHT; y++) {
      for (let x = 0; x < DIFFUSION_WIDTH; x++) {
        const rgb = sampleSkinAngularDiffusion(2 * x / (DIFFUSION_WIDTH - 1) - 1, y / (DIFFUSION_HEIGHT - 1));
        const i = 4 * (y * DIFFUSION_WIDTH + x);
        for (let c = 0; c < 3; c++) bytes[i + c] = Math.round(255 * THREE.MathUtils.clamp(rgb[c], 0, 1));
        bytes[i + 3] = 255;
      }
    }
    packed = bytes;
  }
  return packed.slice();
}

export function createSkinDiffusionTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(skinDiffusionPixels(), DIFFUSION_WIDTH, DIFFUSION_HEIGHT, THREE.RGBAFormat);
  texture.name = 'BF local angular diffusion LUT';
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

const owned = new WeakMap<THREE.MeshPhysicalMaterial, THREE.DataTexture>();
/** Shader uniforms are not enumerated by disposeThreeTree. Own exactly one
 * texture per material, including when a later normal/bump load recompiles. */
export function skinDiffusionTexture(material: THREE.MeshPhysicalMaterial): THREE.DataTexture {
  const existing = owned.get(material);
  if (existing) return existing;
  const texture = createSkinDiffusionTexture();
  owned.set(material, texture);
  const release = () => {
    material.removeEventListener('dispose', release);
    owned.delete(material);
    texture.dispose();
  };
  material.addEventListener('dispose', release);
  return texture;
}

/** Called after regional and scan-micro patches. Keep original GGX, Fresnel,
 * shadowed light and indirect IBL. The LUT substitutes direct diffuse only.
 * A less perturbed normal affects scattering, never specular response. */
export function angularDiffusionShader(fragment: string): string | undefined {
  const old = 'vec3 bfDiffuse = mix(irradiance, directLight.color * bfSoft, mix(0.26, 0.43, vBfDermal.y));';
  const main = '#include <lights_fragment_begin>';
  if (fragment.includes(DIFFUSION_REVIEW_ID) || !fragment.includes('BODYFORGE_DERMAL_REGIONS_V3') ||
    fragment.split(old).length !== 2 || fragment.split(main).length !== 2) return;
  return '// ' + DIFFUSION_REVIEW_ID + '\n' +
    'uniform sampler2D bfDiffusionLut;\nvec3 bfDiffuseNormal;\nfloat bfDiffusionSpread;\n' +
    fragment.replace(old, [
      '// Normalized RGB angular irradiance; texel-centre coordinates.',
      'float bfMu = clamp(dot(bfDiffuseNormal, directLight.direction), -1.0, 1.0);',
      'vec2 bfLutUv = (vec2(bfMu * 0.5 + 0.5, bfDiffusionSpread) * vec2(128.0, 32.0) + 0.5) / vec2(129.0, 33.0);',
      'vec3 bfScatter = texture2D(bfDiffusionLut, bfLutUv).rgb;',
      'vec3 bfDiffuse = directLight.color * mix(vec3(max(0.0, bfCos)), bfScatter, mix(0.62, 0.82, vBfDermal.y));',
    ].join('\n')).replace(main, [
      '// Approximate curvature from the skinned macro normal, not pore detail.',
      'float bfNormalRate = length(dFdx(nonPerturbedNormal)) + length(dFdy(nonPerturbedNormal));',
      'float bfPositionRate = max(0.0001, length(dFdx(vViewPosition)) + length(dFdy(vViewPosition)));',
      'float bfCurvatureProxy = clamp(bfNormalRate / bfPositionRate, 0.0, 5.0);',
      'bfDiffusionSpread = clamp(0.16 + 0.15 * bfCurvatureProxy + 0.27 * vBfDermal.y, 0.0, 1.0);',
      'vec3 bfMixedNormal = mix(normal, nonPerturbedNormal, 0.64);',
      'bfDiffuseNormal = normalize(bfMixedNormal);',
      main,
    ].join('\n'));
}
