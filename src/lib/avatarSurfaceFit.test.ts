import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bodySurfaceRegion, paintFittedBody } from './avatarSurfaceFit';

describe('imported GLB fitted outfit: colors follow original skin vertices', () => {
  it('classifies exactly the posed torso and foot regions, not arms or floating scene props', () => {
    expect(bodySurfaceRegion(0, 1.2, .1)).toBe('shirt');
    expect(bodySurfaceRegion(.34, 1.39, .02)).toBe('shirt');
    expect(bodySurfaceRegion(.55, 1.10, .02)).toBe('skin');
    expect(bodySurfaceRegion(0, .88, .07)).toBe('shorts');
    expect(bodySurfaceRegion(.5, .96, .07)).toBe('skin');
    expect(bodySurfaceRegion(.16, .09, .19)).toBe('shoe');
    expect(bodySurfaceRegion(.16, .016, .19)).toBe('shoe');
    expect(bodySurfaceRegion(0, 1.66, .14)).toBe('skin');
    expect(bodySurfaceRegion(NaN, .2, .3)).toBe('skin');
  });
  it('paints original shared geometry in-place, in linear colors, without creating floating meshes', () => {
    const positions = new Float32Array([
      0, 1.2, .04,
      0, .87, .04,
      .12, .09, .2,
      .52, 1.1, .05,
      0, 1.66, .16,
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const initialAttributes = Object.keys(geometry.attributes).length;
    const counts = paintFittedBody(geometry, { skin: '#c59473', trim: '#55e3f2', outfit: 'base' });
    expect(counts).toMatchObject({ shirt: 1, shorts: 1, shoe: 1, skin: 2 });
    expect(Object.keys(geometry.attributes)).toHaveLength(initialAttributes + 1);
    const material = geometry.getAttribute('color');
    const before = material.getX(0);
    paintFittedBody(geometry, { skin: '#50372f', trim: '#cbfa55', outfit: 'ember' });
    expect(geometry.getAttribute('color')).toBe(material);
    expect(material.getX(0)).not.toBe(before);
    expect(new THREE.Color('#50372f').r).toBeCloseTo(material.getX(4), 4);
    expect(geometry.index).toBeNull();
    expect(geometry.getAttribute('position').array).toBe(positions);
    geometry.dispose();
  });
  it('fails closed on invalid geometry instead of rendering unanchored outfit', () => {
    expect(() => paintFittedBody(new THREE.BufferGeometry(), {
      skin: '#c59473', trim: '#55e3f2', outfit: 'steel',
    })).toThrow(/positions unavailable/);
  });
});
