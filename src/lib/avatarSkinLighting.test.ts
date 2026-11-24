import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { avatarSkinShader, installAvatarSkinLighting, installAvatarScanDetail } from './avatarSkinLighting';

describe('dermal lighting single-pass PBR extension', () => {
  it('patches the pinned physical shader exactly once and retains specular, shadowed incident light and Fresnel', () => {
    const source = '#include <lights_physical_pars_fragment>';
    const result = avatarSkinShader(source);
    expect(result).not.toBe(source);
    expect(result.split('BODYFORGE_DERMAL_WRAP_V1')).toHaveLength(2);
    expect(result).toContain('BRDF_GGX');
    expect(result).toContain('directLight.color');
    expect(result).toContain('BRDF_Lambert(material.diffuseContribution) * (1.0 - F)');
    expect(avatarSkinShader(result)).toBe(result);
    expect(avatarSkinShader('unrelated shader')).toBe('unrelated shader');
  });
  it('layers scan height on the existing normal map only for the scan variant', () => {
    const fragment = '#include <lights_physical_pars_fragment>\n#include <normal_fragment_maps>';
    const scan = avatarSkinShader(fragment, true);
    expect(scan).toContain('BODYFORGE_SCAN_MICRO_V2');
    expect(scan).toContain('USE_NORMALMAP_TANGENTSPACE');
    expect(scan).toContain('perturbNormalArb(-vViewPosition, normal, dHdxy_fwd(), faceDirection)');
    expect(avatarSkinShader(fragment)).not.toContain('BODYFORGE_SCAN_MICRO_V2');
    expect(avatarSkinShader(scan, true)).toBe(scan);
  });
  it('keeps the base normal atlas and replaces only the owned fallback bump texture', () => {
    const fallback = new THREE.Texture(), normal = new THREE.Texture(), scan = new THREE.Texture();
    const material = new THREE.MeshPhysicalMaterial({bumpMap:fallback,normalMap:normal});
    const disposed = vi.fn();
    fallback.addEventListener('dispose',disposed);
    installAvatarScanDetail(material,scan);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(material.normalMap).toBe(normal);
    expect(material.bumpMap).toBe(scan);
    expect(scan.colorSpace).toBe(THREE.NoColorSpace);
    expect(scan.wrapS).toBe(THREE.RepeatWrapping);
    expect(scan.repeat.toArray()).toEqual([24,24]);
    expect(material.customProgramCacheKey()).toBe('bodyforge-scan-micro-v2');
    installAvatarScanDetail(material,scan);
    expect(disposed).toHaveBeenCalledTimes(1);
    material.dispose(); normal.dispose(); scan.dispose();
  });
  it('provides a deterministic cache key independent from unmodified materials', () => {
    const a = new THREE.MeshPhysicalMaterial(), b = new THREE.MeshPhysicalMaterial();
    installAvatarSkinLighting(a);
    expect(a.customProgramCacheKey()).toBe('bodyforge-dermal-wrap-v1');
    expect(b.customProgramCacheKey()).not.toBe(a.customProgramCacheKey());
    a.dispose(); b.dispose();
  });
});
