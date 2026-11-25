import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { installScalpDensity, scalpFraction, scalpCoverage, scalpDensityShaders, setScalpDensityLook } from './avatarScalpDensity';
import { createAvatarPhysique } from './avatarPhysique';
import { disposeThreeTree } from './threeResources';

describe('scalp-root density on the existing athlete', () => {
  it('softens a bounded band without coloring the face or neck', () => {
    expect(scalpCoverage(.92)).toBe(1);
    expect(scalpCoverage(1.055)).toBe(0);
    expect(scalpCoverage(.99)).toBeGreaterThan(.3);
    expect(scalpCoverage(.99)).toBeLessThan(.6);
    for (const p of [[0,1.65,.16],[.032,1.677,.143],[0,1.60,.15],[0,1.43,.1],[.3,1.7,.04]] as const) {
      expect(scalpCoverage(scalpFraction(p[0], p[1], p[2]))).toBe(0);
    }
  });
  it('adds stable numerical attributes only to the pinned rig and tracks dye and fallback', async () => {
    const data = Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
    const { scene } = await new GLTFLoader().parseAsync(data.buffer, '');
    const material = new THREE.MeshPhysicalMaterial();
    try {
      const body = scene.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const ears = scene.getObjectByName('BODYFORGE_SkinEars') as THREE.SkinnedMesh;
      const source = body.geometry.getAttribute('position');
      const weights = body.geometry.getAttribute('skinWeight');
      expect(installScalpDensity([ears], material)).toBeUndefined();
      const state = installScalpDensity([body, ears], material)!;
      expect(state).toBeDefined();
      const field = body.geometry.getAttribute('bfScalpFraction');
      expect(field.count).toBe(65895);
      expect(field.normalized).toBe(true);
      expect(field.array.byteLength).toBe(65895);
      expect(Array.from(ears.geometry.getAttribute('bfScalpFraction').array).every(n => n === 255)).toBe(true);
      let interior = 0, transition = 0;
      for (let i=0; i<field.count; i++) {
        const coverage = scalpCoverage(field.getX(i)*1.5);
        if (coverage === 1) interior++;
        else if (coverage > 0) transition++;
        if (source.getY(i)<1.64) expect(coverage).toBe(0);
      }
      expect(interior).toBeGreaterThan(100);
      expect(transition).toBeGreaterThan(20);
      console.info('SCALP_DENSITY', JSON.stringify({interior, transition, bytes:field.array.byteLength}));
      const ink = new THREE.Color('#181a21'), silver = new THREE.Color('#b7c1cd');
      expect(state.enabled.value).toBe(0);
      setScalpDensityLook(material, ink, true);
      expect(state.enabled.value).toBe(1);
      expect(state.color.value.equals(ink.clone().multiplyScalar(.42))).toBe(true);
      setScalpDensityLook(material, silver, true);
      expect(state.color.value.equals(silver.clone().multiplyScalar(.42))).toBe(true);
      setScalpDensityLook(material, silver, false);
      expect(state.enabled.value).toBe(0);
      expect(body.geometry.getAttribute('position')).toBe(source);
      expect(body.geometry.getAttribute('skinWeight')).toBe(weights);
      const rest = Array.from(field.array);
      createAvatarPhysique(scene)({arms:5,core:5,legs:5,back:5});
      expect(body.geometry.getAttribute('bfScalpFraction')).toBe(field);
      expect(Array.from(field.array)).toEqual(rest);
    } finally { material.dispose(); disposeThreeTree(scene); }
  });
  it('patches known shader anchors once and refuses unsupported sources', () => {
    const v = '#include <begin_vertex>';
    const f = '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <lights_physical_fragment>';
    const shaders = scalpDensityShaders(v,f)!;
    expect(shaders.vertex).toContain('bfScalpFraction');
    expect(shaders.fragment).toContain('bfScalpEnabled * (1.0 - smoothstep');
    expect(shaders.fragment).toContain('mix(diffuseColor.rgb, bfScalpColor, bfScalpCoverage)');
    expect(scalpDensityShaders(shaders.vertex, shaders.fragment)).toBeUndefined();
    expect(scalpDensityShaders('unknown',f)).toBeUndefined();
  });
});
