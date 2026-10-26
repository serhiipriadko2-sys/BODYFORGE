import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HairStyle } from './avatarLook';

/**
 * One batched scalp-and-locks mesh per style — no detached spheres,
 * downloaded faces, photos or texture libraries.
 *
 * Scalp fit is bounded to BODYFORGE's CC0 and procedural avatars. The
 * same material is shared across cached styles, owned by the parent scene.
 */
export function createAvatarHair(style: HairStyle, material: THREE.Material, z = 0): THREE.Group {
  const hair = new THREE.Group();
  hair.name = 'hair-style-' + style;

  const radius = style === 'buzz' ? .302 : style === 'swept' ? .327 : .316;
  const shell = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI * .505);
  const vertices = shell.getAttribute('position') as THREE.BufferAttribute;

  // A subtle curved hairline and a side-swept crown remain contiguous with
  // the scalp mesh. Deformations are finite and limited to centimetres.
  for (let i = 0; i < vertices.count; i++) {
    let x = vertices.getX(i), y = vertices.getY(i), depth = vertices.getZ(i);
    // Wrap temples and the back of the skull; retain a higher front hairline.
    const theta = Math.acos(THREE.MathUtils.clamp(y / radius, -1, 1));
    const azimuth = Math.atan2(depth, x);
    const frontDirection = Math.max(0, Math.sin(azimuth));
    const extent = Math.PI * (.64 - .16 * frontDirection);
    const wrappedTheta = theta / (Math.PI * .505) * extent;
    x = Math.cos(azimuth) * Math.sin(wrappedTheta) * radius;
    depth = Math.sin(azimuth) * Math.sin(wrappedTheta) * radius;
    y = Math.cos(wrappedTheta) * radius;
    const front = Math.max(0, depth / radius);
    const crown = Math.max(0, y / radius);
    const border = 1 - crown;
    const part = x / radius;
    let dy = 0;
    let dx = 0;
    if (style === 'crop') {
      dy = -(front * border) * (.033 + .013 * Math.cos(part * 4));
    } else if (style === 'swept') {
      dy = .018 * part * (1 - crown * .3) - .037 * front * border;
      dx = .026 * crown * crown;
    } else {
      dy = -.010 * front * border;
    }
    vertices.setXYZ(i, x + dx, y + dy, depth);
  }
  vertices.needsUpdate = true;
  shell.computeVertexNormals();

  shell.scale(1, style === 'buzz' ? .73 : style === 'swept' ? .88 : .67, 1);
  shell.translate(0, style === 'buzz' ? 4.620 : 4.576, z);
  const parts: THREE.BufferGeometry[] = [shell];
  if (style !== 'buzz') {
    // Tapered swept locks overlap the scalp; batch them into the same draw call.
    // No alpha cards or transparent hair sorting, and no extra scene nodes.
    const locks = style === 'swept' ? 24 : 18;
    for (let i = 0; i < locks; i++) {
      const x = -.22 + (i % 9) * .055;
      const row = Math.floor(i / 9);
      const front = .19 - row * .10;
      const sweep = style === 'swept' ? .09 : .035;
      const rise = style === 'swept' ? .025 : .015;
      const point = (t:number) => {
        const px = x + sweep * Math.sin(t * Math.PI * .7);
        const pz = front - t * .26;
        const py = 4.576 + Math.sqrt(Math.max(.002, radius ** 2 - px ** 2 - pz ** 2)) * (style === 'swept' ? .88 : .67);
        return new THREE.Vector3(px, py + rise * Math.sin(Math.PI * t), pz + z);
      };
      const curve = new THREE.CatmullRomCurve3([point(0),point(.33),point(.67),point(1)]);
      const lock = new THREE.TubeGeometry(curve, 10, .023, 5, false);
      const points = lock.getAttribute('position') as THREE.BufferAttribute;
      for (let j = 0; j < points.count; j++) {
        const t = Math.floor(j / 6) / 10;
        const centre = curve.getPointAt(t);
        const taper = Math.max(.05, Math.sin(Math.PI * (t * .85 + .10)) * (1 - t * .75));
        points.setXYZ(j, centre.x + (points.getX(j) - centre.x) * taper,
          centre.y + (points.getY(j) - centre.y) * taper,
          centre.z + (points.getZ(j) - centre.z) * taper);
      }
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
