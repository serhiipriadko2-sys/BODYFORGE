import * as THREE from 'three';
import { regionalDermalShaders } from './avatarDermalRegions';
import { scalpDensityShaders, scalpDensityState } from './avatarScalpDensity';
import { angularDiffusionShader, skinDiffusionTexture } from './avatarSkinDiffusion';

const diffuseLine = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';

// Single-pass RGB diffuse-wrap approximation, not volumetric SSS.
// Retain Three's shadowed incident light, Fresnel, and original GGX specular.
// Red diffuses farther than green/blue; the small blend avoids a waxy face.
// Fail closed to stock PBR if a future Three version changes the anchor.
export function avatarSkinShader(fragment: string, scanDetail = false): string {
  const include = '#include <lights_physical_pars_fragment>';
  const source = THREE.ShaderChunk.lights_physical_pars_fragment;
  if (!fragment.includes(include) || source.split(diffuseLine).length !== 2) return fragment;
  const skin = source.replace(diffuseLine, `
    // BODYFORGE_DERMAL_WRAP_V1
    float bfCos = dot(geometryNormal, directLight.direction);
    vec3 bfWrap = vec3(0.40, 0.22, 0.13);
    vec3 bfSoft = clamp((vec3(bfCos) + bfWrap) / (1.0 + bfWrap), 0.0, 1.0);
    vec3 bfDiffuse = mix(irradiance, directLight.color * bfSoft, 0.38);
    reflectedLight.directDiffuse += bfDiffuse * BRDF_Lambert(material.diffuseContribution) * (1.0 - F);
  `);
  let result = fragment.replace(include, skin);
  const normalInclude = '#include <normal_fragment_maps>';
  if (scanDetail && result.includes(normalInclude)) {
    // Three uses the normal map OR the bump map by default. Keep the original
    // tangent-space atlas and add only the scan's high-frequency height slope.
    // This does not change the base geometry, skinning or diffuse texture.
    result = result.replace(normalInclude, `${normalInclude}
      // BODYFORGE_SCAN_MICRO_V2
      #if defined(USE_NORMALMAP_TANGENTSPACE) && defined(USE_BUMPMAP)
        normal = perturbNormalArb(-vViewPosition, normal, dHdxy_fwd(), faceDirection);
      #endif
    `);
  }
  return result;
}

export function installAvatarSkinLighting(material: THREE.MeshPhysicalMaterial, scanDetail = false): void {
  const regional = material.userData.BODYFORGE_regionalDermal === true;
  const scalp = scalpDensityState(material);
  const diffusion = import.meta.env.DEV && regional && material.userData.BODYFORGE_diffusionReview === true;
  const lut = diffusion ? skinDiffusionTexture(material) : undefined;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = avatarSkinShader(shader.fragmentShader, scanDetail);
    if (regional) {
      const patched=regionalDermalShaders(shader.vertexShader,shader.fragmentShader);
      if(patched){
        shader.vertexShader=patched.vertex;
        shader.fragmentShader=patched.fragment;
      }
    }
    if (scalp) {
      const patched = scalpDensityShaders(shader.vertexShader, shader.fragmentShader);
      if (patched) {
        shader.vertexShader = patched.vertex;
        shader.fragmentShader = patched.fragment;
        shader.uniforms.bfScalpEnabled = scalp.enabled;
        shader.uniforms.bfScalpColor = scalp.color;
      }
    }
    if (lut) {
      const patched = angularDiffusionShader(shader.fragmentShader);
      if (patched) {
        shader.fragmentShader = patched;
        shader.uniforms.bfDiffusionLut = { value: lut };
      }
    }
  };
  material.customProgramCacheKey = () => (scanDetail ? 'bodyforge-scan-micro-v2' : 'bodyforge-dermal-wrap-v1') + (regional ? '-regions-v3' : '') + (scalp ? '-scalp-density-v1' : '') + (diffusion ? '-angular-diffusion-v1' : '');
}

/** Transfer ownership only for this scene's skin material. The previous
 * procedural texture must not be shared by clothing or other live scenes. */
export function installAvatarScanDetail(material: THREE.MeshPhysicalMaterial, texture: THREE.Texture): void {
  texture.name = 'BODYFORGE scan-derived cheek microrelief';
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 24);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  const previous = material.bumpMap;
  material.bumpMap = texture;
  // Unitless in Three r186's normalized screen derivative implementation.
  // Mipmaps suppress subpixel texture aliasing in the full-body view.
  material.bumpScale = .42;
  installAvatarSkinLighting(material, true);
  material.needsUpdate = true;
  if (previous !== texture) previous?.dispose();
}
