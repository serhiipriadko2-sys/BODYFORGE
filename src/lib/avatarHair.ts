import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HairStyle } from './avatarLook';

/** Opaque, scene-owned hair. All locks share one geometry and draw call.
 * Coordinates retain the procedural head anchor used by the imported rig.
 * Geometry is deterministic: no random seed, alpha cards or texture downloads.
 */
export function createAvatarHair(style: HairStyle, material: THREE.Material, z = 0): THREE.Group {
  const hair = new THREE.Group();
  hair.name = 'hair-style-' + style;

  const radius = style === 'buzz' ? .302 : style === 'swept' ? .327 : .316;
  const height = style === 'buzz' ? .73 : style === 'swept' ? .80 : .67;
  const base = style === 'buzz' ? 4.620 : 4.576;
  const shell = new THREE.SphereGeometry(radius, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const vertices = shell.getAttribute('position') as THREE.BufferAttribute;

  for (let i = 0; i < vertices.count; i++) {
    const px = vertices.getX(i), py = vertices.getY(i), pz = vertices.getZ(i);
    const azimuth = Math.atan2(pz, px);
    const front = Math.max(0, Math.sin(azimuth));
    const theta = Math.acos(THREE.MathUtils.clamp(py / radius, -1, 1));
    // Receded forehead, low temples and nape. Small asymmetric changes break
    // the former straight helmet edge without exposing holes through the cap.
    const frontExtent = style === 'buzz' ? .445 : style === 'swept' ? .405 : .420;
    const irregular = (.007 * Math.sin(azimuth * 7 + .4) + .004 * Math.sin(azimuth * 13)) * (style === 'buzz' ? .5 : 1);
    const extent = Math.PI * (.625 - (.625 - frontExtent) * front ** .7 + irregular);
    const angle = theta / (Math.PI / 2) * extent;
    const relief = style === 'buzz' ? .0007 : .0032;
    const r = radius + relief * Math.sin(azimuth * 27 + angle * 8) * Math.sin(angle);
    vertices.setXYZ(i, Math.cos(azimuth) * Math.sin(angle) * r,
      base + Math.cos(angle) * r * height, Math.sin(azimuth) * Math.sin(angle) * r + z);
  }
  vertices.needsUpdate = true;
  shell.computeVertexNormals();

  const parts: THREE.BufferGeometry[] = [shell];
  if (style !== 'buzz') {
    const locks = style === 'swept' ? 64 : 48;
    const fringe = locks / 4;
    const noise = (seed: number) => {
      const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return value - Math.floor(value);
    };
    const edgeAngle = (azimuth: number) => {
      const front = Math.max(0, Math.sin(azimuth));
      return Math.PI * (.625 - (.625 - (style === 'swept' ? .405 : .420)) * front ** .7);
    };
    for (let seed = 0; seed < locks; seed++) {
        const isFringe = seed >= locks - fringe;
        // A golden-angle distribution breaks the former rows of parallel teeth.
        // Short fringe locks also cover the cap's smooth frontal band.
        const azimuth = isFringe ? Math.PI * (.22 + .56 * noise(seed + 17)) : seed * 2.399963 + noise(seed) * .35;
        const theta = isFringe ? edgeAngle(azimuth) - .13 - noise(seed + 3) * .13
          : seed < 5 ? .07 + noise(seed + 5) * .13
          : Math.min(edgeAngle(azimuth) - .13, Math.acos(1 - (.07 + .84 * noise(seed + 5))));
        const variation = noise(seed + 9) * 2 - 1;
        const turn = (style === 'swept' ? .35 : .20) * (variation * .8 + .35);
        const length = isFringe ? .16 + noise(seed + 4) * .16 : .20 + noise(seed + 6) * .24;
        const lift = (style === 'swept' ? .013 : .008) * (.6 + noise(seed + 7) * .8);
        const width = (style === 'swept' ? .017 : .014) * (.72 + noise(seed + 8) * .70);
        const thickness = (style === 'swept' ? .006 : .005) * (.65 + noise(seed + 2) * .5);
        const point = (t: number) => {
          const az = azimuth + turn * t + .16 * variation * Math.sin(Math.PI * t);
          const polar = Math.min(edgeAngle(az) + .025, theta + length * t + .045 * variation * Math.sin(Math.PI * t));
          const offset = lift * Math.sin(Math.PI * t) - .0045 * (1 - t) ** 3;
          const r = radius + offset;
          return new THREE.Vector3(Math.cos(az) * Math.sin(polar) * r,
            base + Math.cos(polar) * r * height, Math.sin(az) * Math.sin(polar) * r + z);
        };
        const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
        const segments = 8, sides = 6;
        for (let step = 0; step <= segments; step++) {
          const t = step / segments;
          const centre = point(t);
          const tangent = point(Math.min(1, t + .002)).sub(point(Math.max(0, t - .002))).normalize();
          const outward = new THREE.Vector3(centre.x, (centre.y - base) / (height * height), centre.z - z).normalize();
          const across = new THREE.Vector3().crossVectors(tangent, outward).normalize();
          const normal = new THREE.Vector3().crossVectors(across, tangent).normalize();
          const taper = .035 + .965 * Math.sin(Math.PI * (.06 + t * .94)) ** .7;
          for (let side = 0; side <= sides; side++) {
            const angle = side / sides * Math.PI * 2;
            const vertex = centre.clone().addScaledVector(across, Math.cos(angle) * width * taper)
              .addScaledVector(normal, Math.sin(angle) * thickness * taper);
            positions.push(vertex.x, vertex.y, vertex.z);
            // U follows width/circumference, V follows root-to-tip growth.
            uvs.push(side / sides, t);
            if (step < segments && side < sides) {
              const a = step * (sides + 1) + side, b = a + sides + 1;
              indices.push(a, b, a + 1, a + 1, b, b + 1);
            }
          }
        }
        // Closed tips prevent a light-coloured haircut exposing open tubes.
        for (const [step, reverse] of [[0, false], [segments, true]] as const) {
          const start = step * (sides + 1);
          for (let side = 1; side < sides - 1; side++) {
            indices.push(start, start + side + (reverse ? 1 : 0), start + side + (reverse ? 0 : 1));
          }
        }
        const lock = new THREE.BufferGeometry();
        lock.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        lock.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
        lock.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        lock.setIndex(indices);
        lock.computeVertexNormals();
        parts.push(lock);
    }
  }
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (!geometry) throw new Error('Avatar hair geometry cannot be batched');
  const cap = new THREE.Mesh(geometry, material);
  cap.name = 'scalp-and-swept-locks';
  hair.add(cap);
  return hair;
}
