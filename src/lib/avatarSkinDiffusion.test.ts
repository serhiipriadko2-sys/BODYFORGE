import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { avatarSkinShader, installAvatarSkinLighting, installAvatarScanDetail } from './avatarSkinLighting';
import { regionalDermalShaders } from './avatarDermalRegions';
import {
  angularDiffusionShader, createSkinDiffusionTexture, diffuseCap, DIFFUSION_HEIGHT,
  DIFFUSION_REVIEW_ID, DIFFUSION_WIDTH, sampleSkinAngularDiffusion, skinDiffusionPixels,
  skinDiffusionTexture,
} from './avatarSkinDiffusion';

describe('local angular skin diffusion review', () => {
  it('conserves the angular mean of the Lambert response and keeps all channels bounded', () => {
    let worst = 0, monotoneTolerance = 0;
    for (const spread of [0, .125, .25, .5, .75, 1]) {
      const mean = [0, 0, 0];
      let previous = [0, 0, 0];
      for (let i = 0; i < 1024; i++) {
        const mu = (i + .5) / 512 - 1;
        const rgb = sampleSkinAngularDiffusion(mu, spread);
        rgb.forEach((v, c) => {
          expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(true);
          mean[c] += v / 1024;
          monotoneTolerance = Math.max(monotoneTolerance, previous[c] - v);
        });
        previous = [...rgb];
      }
      worst = Math.max(worst, ...mean.map(v => Math.abs(v - .25)));
    }
    expect(worst).toBeLessThan(2e-5);
    expect(monotoneTolerance).toBeLessThan(1e-6);
    expect(diffuseCap(.2, 0)).toBe(.2);
    expect(diffuseCap(-.2, 0)).toBe(0);
    expect(sampleSkinAngularDiffusion(-1, 1)).toEqual([0, 0, 0]);
    const edge = sampleSkinAngularDiffusion(0, 1);
    expect(edge[0]).toBeGreaterThan(edge[1]);
    expect(edge[1]).toBeGreaterThan(edge[2]);
    console.info('SKIN_DIFFUSION_INTEGRAL', JSON.stringify({ samples: 6144, worstAngularMeanError: worst, edge }));
  });

  it('encodes a deterministic linear non-color LUT within the quantization budget', () => {
    const a = skinDiffusionPixels(), b = skinDiffusionPixels();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    expect(a.byteLength).toBe(129 * 33 * 4);
    let maxError = 0, worstIntegral = 0;
    for (let y = 0; y < DIFFUSION_HEIGHT; y++) {
      const mean = [0, 0, 0];
      for (let x = 0; x < DIFFUSION_WIDTH; x++) {
        const rgb = sampleSkinAngularDiffusion(2 * x / 128 - 1, y / 32);
        const i = 4 * (y * DIFFUSION_WIDTH + x);
        for (let c = 0; c < 3; c++) {
          maxError = Math.max(maxError, Math.abs(a[i + c] / 255 - rgb[c]));
          mean[c] += a[i + c] / 255 * ((x === 0 || x === 128) ? .5 : 1) / 128;
        }
        expect(a[i + 3]).toBe(255);
      }
      worstIntegral = Math.max(worstIntegral, ...mean.map(v => Math.abs(v - .25)));
    }
    expect(maxError).toBeLessThan(.5 / 255 + 1e-9);
    expect(worstIntegral).toBeLessThan(.001);
    const texture = createSkinDiffusionTexture();
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    expect(texture.minFilter).toBe(THREE.LinearFilter);
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.image.width).toBe(129);
    expect(texture.image.height).toBe(33);
    texture.dispose();
    console.info('SKIN_DIFFUSION_LUT', JSON.stringify({ bytes: a.byteLength, maxError, worstIntegral }));
  });

  it('changes only the intended direct diffuse expression and preserves normal-map/specular/scalp anchors', () => {
    const vertex = THREE.ShaderLib.physical.vertexShader;
    const source = avatarSkinShader(THREE.ShaderLib.physical.fragmentShader, true);
    const regional = regionalDermalShaders(vertex, source)!;
    const next = angularDiffusionShader(regional.fragment)!;
    expect(next).toContain(DIFFUSION_REVIEW_ID);
    expect(next).toContain('BRDF_GGX');
    expect(next).toContain('BRDF_Lambert(material.diffuseContribution) * (1.0 - F)');
    expect(next).toContain('directLight.color * mix');
    expect(next).toContain('nonPerturbedNormal');
    expect(next).toContain('BODYFORGE_SCAN_MICRO_V2');
    expect(next).toContain('BODYFORGE_DERMAL_REGIONS_V3');
    expect(next).toContain('#include <lights_fragment_maps>');
    expect(next.split('texture2D(bfDiffusionLut,')).toHaveLength(2);
    expect(angularDiffusionShader(next)).toBeUndefined();
    expect(angularDiffusionShader(source)).toBeUndefined();
    expect(angularDiffusionShader(regional.fragment.replace('#include <lights_fragment_begin>', ''))).toBeUndefined();
  });

  it('keeps one owned LUT through recompile and releases it once', () => {
    const material = new THREE.MeshPhysicalMaterial();
    material.userData.BODYFORGE_regionalDermal = true;
    material.userData.BODYFORGE_diffusionReview = true;
    installAvatarSkinLighting(material);
    expect(material.customProgramCacheKey()).toContain('angular-diffusion-v1');
    const t = skinDiffusionTexture(material), dispose = vi.spyOn(t, 'dispose');
    const scan = new THREE.Texture();
    installAvatarScanDetail(material, scan);
    expect(skinDiffusionTexture(material)).toBe(t);
    expect(material.customProgramCacheKey()).toContain('scan-micro-v2-regions-v3-angular-diffusion-v1');
    material.dispose(); material.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    scan.dispose();
    const base = new THREE.MeshPhysicalMaterial();
    installAvatarSkinLighting(base);
    expect(base.customProgramCacheKey()).toBe('bodyforge-dermal-wrap-v1');
    base.dispose();
  });
});
