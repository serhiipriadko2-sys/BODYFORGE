import * as THREE from 'three';
import type { HairStyle } from './avatarLook';

/**
 * One continuous low-poly hair shell per style — no detached spheres,
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
    const x = vertices.getX(i), y = vertices.getY(i), depth = vertices.getZ(i);
    const front = Math.max(0, depth / radius);
    const crown = Math.max(0, y / radius);
    const border = 1 - crown;
    const part = x / radius;
    let dy = 0;
    let dx = 0;
    if (style === 'crop') {
      dy = -(front * border) * (.033 + .013 * Math.cos(part * 4));
    } else if (style === 'swept') {
      dy = .066 * part * (1 - crown * .3) - .037 * front * border;
      dx = .026 * crown * crown;
    } else {
      dy = -.010 * front * border;
    }
    vertices.setXYZ(i, x + dx, y + dy, depth);
  }
  vertices.needsUpdate = true;
  shell.computeVertexNormals();

  const cap = new THREE.Mesh(shell, material);
  cap.name = 'continuous-hair-shell';
  cap.position.set(0, style === 'buzz' ? 4.620 : 4.576, z);
  cap.scale.y = style === 'buzz' ? .73 : style === 'swept' ? .88 : .67;
  hair.add(cap);
  return hair;
}
