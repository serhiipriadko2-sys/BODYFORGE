import * as THREE from 'three';
import type { Muscle } from './game';

type Ridge = { centre: readonly [number, number, number]; radius: readonly [number, number, number]; slope: number; amplitude: number; group: Muscle };
const SHIRT: readonly Ridge[] = [
  // Diagonal compression folds on the lower front and back. The collar,
  // chest emblem and cut edges are outside these compact supports.
  { centre: [.105, 1.073, .117], radius: [.091,.019,.081], slope: -.24, amplitude: .0030, group:'core' },
  { centre: [.115, 1.125, .120], radius: [.076,.021,.072], slope: .32, amplitude: .0025, group:'core' },
  { centre: [.105, 1.075,-.080], radius: [.10,.019,.061], slope: .22, amplitude: .0031, group:'back' },
  { centre: [.110, 1.133,-.082], radius: [.092,.020,.058], slope: -.28, amplitude: .0024, group:'back' },
  { centre: [.265, 1.345, .020], radius: [.052,.021,.075], slope: -.54, amplitude: .0027, group:'arms' },
  { centre: [.278, 1.396,-.024], radius: [.048,.018,.065], slope: .52, amplitude: .0021, group:'arms' },
];
const SHORTS: readonly Ridge[] = [
  { centre: [.126,.950,.088], radius: [.071,.019,.082], slope: -.44, amplitude: .0031, group:'legs' },
  { centre: [.133,.875,.094], radius: [.065,.022,.078], slope: .32, amplitude: .0026, group:'legs' },
  { centre: [.125,.895,-.067], radius: [.069,.021,.058], slope: -.29, amplitude: .0027, group:'legs' },
];
export interface GarmentFoldProfile {
  /** Height and gradient (x/y/z) per vertex, grouped by tension driver. */
  fields: { group: Muscle; values: Float32Array }[];
}

/** Small outward folds on the actual rest surface, never inward displacement.
 * A compact polynomial ridge has zero slope at the boundary. This is an
 * authored tension approximation, not a cloth simulation. */
export function createGarmentFoldProfile(name: string, rest: Float32Array): GarmentFoldProfile | undefined {
  const ridges = name === 'BODYFORGE_Shirt' ? SHIRT : name === 'BODYFORGE_Shorts' ? SHORTS : undefined;
  if (!ridges) return undefined;
  const fields = [...new Set(ridges.map(ridge=>ridge.group))].map(group => {
    const values = new Float32Array(rest.length / 3 * 4);
    for (const ridge of ridges.filter(r=>r.group===group)) {
      const [cx,cy,cz] = ridge.centre, [rx,ry,rz] = ridge.radius;
      for (let i=0;i<rest.length/3;i++) {
        const x=rest[i*3], y=rest[i*3+1], z=rest[i*3+2], side=x<0?-1:1, a=Math.abs(x)-cx;
        const u=a/rx, v=(y-cy-ridge.slope*a)/ry, w=(z-cz)/rz;
        const q=1-u*u-v*v-w*w;
        if (q<=0) continue;
        const k=i*4, derivative=-6*ridge.amplitude*q*q;
        values[k]+=ridge.amplitude*q*q*q;
        values[k+1]+=derivative*(u/rx-v*ridge.slope/ry)*side;
        values[k+2]+=derivative*v/ry;
        values[k+3]+=derivative*w/rz;
      }
    }
    return { group, values };
  });
  return { fields };
}

/** Tension follows its own muscle group; at level five retain 45% of the
 * neutral ridge amplitude rather than erasing all fabric detail. */
export function sampleGarmentFold(profile: GarmentFoldProfile, index: number,
    muscles: Partial<Record<Muscle, number>>, gradient: THREE.Vector3): number {
  let height=0;
  gradient.set(0,0,0);
  const k=index*4;
  for (const {group,values} of profile.fields) {
    const level=muscles[group]??0;
    const tension=1-.55*(Number.isFinite(level)?THREE.MathUtils.clamp(level,0,5)/5:0);
    height+=values[k]*tension;
    gradient.x+=values[k+1]*tension;
    gradient.y+=values[k+2]*tension;
    gradient.z+=values[k+3]*tension;
  }
  if (height>.0042) {
    gradient.set(0,0,0);
    return .0042;
  }
  return height;
}
