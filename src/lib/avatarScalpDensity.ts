import * as THREE from 'three';

const ATTRIBUTE = 'bfScalpFraction';
const LIMIT = 1.5;
const START = .92;
const END = 1.055;
export type ScalpDensity = {
  enabled: { value: number };
  color: { value: THREE.Color };
};
const states = new WeakMap<THREE.Material, ScalpDensity>();

/** Same ellipsoid, centre and irregular edge as author-strand-groom-v2.py.
 * Values are in original glTF bind coordinates, not posed world space. */
export function scalpFraction(x: number, y: number, z: number): number {
  if (![x, y, z].every(Number.isFinite) || y < 1.64 || Math.abs(x) > .10) return LIMIT;
  const u = x / .086, v = (z - .044) / .103, w = (y - 1.689) / .085;
  const phi = Math.atan2(v, u);
  const front = Math.max(0, Math.sin(phi)), back = Math.max(0, -Math.sin(phi));
  const temple = front > 0 ? Math.exp(-(((front - .65) / .18) ** 2)) : 0;
  const edge = 1.36 + .45 * back ** 1.4 - .35 * front ** .65 - .055 * temple
    + .016 * Math.sin(phi * 9) + .007 * Math.sin(phi * 23 + .4);
  return THREE.MathUtils.clamp(Math.atan2(Math.hypot(u, v), w) / edge, 0, LIMIT);
}

export function scalpCoverage(fraction: number): number {
  return 1 - THREE.MathUtils.smoothstep(fraction, START, END);
}

/** All primitives sharing the body material receive the same attribute;
 * only the pinned scalp may have a nonzero root density. */
export function installScalpDensity(surfaces: readonly THREE.SkinnedMesh[], material: THREE.Material): ScalpDensity | undefined {
  const body = surfaces.find(s => s.name === 'BODYFORGE_Body');
  if (!body || body.userData.BODYFORGE_groom !== 'v2' ||
      body.geometry.getAttribute('position')?.count !== 65895 ||
      !surfaces.every(s => s.geometry.getAttribute('position')?.itemSize === 3)) return;
  if (states.has(material)) return;
  for (const surface of surfaces) {
    const p = surface.geometry.getAttribute('position');
    const data = new Uint8Array(p.count);
    data.fill(255);
    if (surface === body) {
      for (let i = 0; i < p.count; i++) {
        data[i] = Math.round(scalpFraction(p.getX(i), p.getY(i), p.getZ(i)) / LIMIT * 255);
      }
    }
    surface.geometry.setAttribute(ATTRIBUTE, new THREE.Uint8BufferAttribute(data, 1, true));
  }
  const state: ScalpDensity = { enabled: { value: 0 }, color: { value: new THREE.Color('#181a21') } };
  states.set(material, state);
  return state;
}

export function scalpDensityState(material: THREE.Material): ScalpDensity | undefined {
  return states.get(material);
}

/** Runtime style changes update uniform objects shared with the compiled
 * program. The original card/buzz fallbacks never receive scalp pigment. */
export function setScalpDensityLook(material: THREE.Material, color: THREE.Color, active: boolean): void {
  const state = states.get(material);
  if (!state) return;
  state.enabled.value = active ? 1 : 0;
  state.color.value.copy(color).multiplyScalar(.42);
}

/** Single-pass transition after albedo and vertex colour. No texture,
 * extra mesh, transparency sorting or new draw call. */
export function scalpDensityShaders(vertex: string, fragment: string): { vertex: string; fragment: string } | undefined {
  const begin = '#include <begin_vertex>', color = '#include <color_fragment>', rough = '#include <roughnessmap_fragment>';
  if (vertex.split(begin).length !== 2 || fragment.split(color).length !== 2 ||
      fragment.split(rough).length !== 2 || fragment.split('#include <lights_physical_fragment>').length !== 2 || vertex.includes('BODYFORGE_SCALP_DENSITY_V1')) return;
  const varying = 'varying float vBfScalpFraction;\n';
  return {
    vertex: '// BODYFORGE_SCALP_DENSITY_V1\nattribute float bfScalpFraction;\n' + varying
      + vertex.replace(begin, begin + '\n vBfScalpFraction = bfScalpFraction * 1.5;'),
    fragment: varying + 'uniform float bfScalpEnabled;\nuniform vec3 bfScalpColor;\n' + fragment
      .replace(color, color + `
        // BODYFORGE_SCALP_DENSITY_V1
        float bfScalpCoverage = bfScalpEnabled * (1.0 - smoothstep(0.92, 1.055, vBfScalpFraction));
        diffuseColor.rgb = mix(diffuseColor.rgb, bfScalpColor, bfScalpCoverage);
      `)
      // Add at the later physical-material include, after regional roughness.
      .replace('#include <lights_physical_fragment>', 'roughnessFactor = mix(roughnessFactor, 0.81, bfScalpCoverage);\n#include <lights_physical_fragment>'),
  };
}
