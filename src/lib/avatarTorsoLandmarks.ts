import { addMuscleLobe, type MuscleLobe } from './avatarMuscleAnatomy';

/** Artistic surface landmarks registered to the pinned athlete in bind metres.
 * Structural anatomy, not muscle mass: collarbone, sternum and scapula persist
 * even at level zero. Compact C2 fields share the skin/garment displacement
 * and analytic normal transform. Not measured or a biomechanical simulation. */
export const TORSO_LANDMARKS = [
  { name:'clavicle medial',center:[.047,1.455,.089],radius:[.033,.026,.036],offset:[0,0,.0055] },
  { name:'clavicle shaft',center:[.101,1.455,.085],radius:[.065,.025,.040],offset:[0,0,.007] },
  { name:'clavicle lateral',center:[.168,1.447,.080],radius:[.056,.030,.041],offset:[0,.001,.0045] },
  { name:'suprasternal hollow',center:[0,1.458,.092],radius:[.027,.030,.032],offset:[0,0,-.0055] },
  { name:'pectoral resting contour',center:[.101,1.327,.139],radius:[.084,.063,.053],offset:[0,0,.008] },
  { name:'pectoral inferior transition',center:[.105,1.269,.139],radius:[.080,.035,.054],offset:[0,0,-.0035] },
  { name:'scapular spine',center:[.125,1.407,-.080],radius:[.080,.034,.045],offset:[0,0,-.007] },
  { name:'scapular medial border',center:[.070,1.345,-.084],radius:[.035,.091,.047],offset:[0,0,-.005],slope:[.16,0] },
  { name:'scapular lower angle',center:[.104,1.299,-.074],radius:[.053,.049,.048],offset:[0,0,-.005] },
  { name:'thoracic midline groove',center:[0,1.352,-.073],radius:[.028,.115,.040],offset:[0,0,.004] },
] as const satisfies readonly MuscleLobe[];

export function addTorsoLandmarks(x:number,y:number,z:number,displacement:Float64Array,jacobian:Float64Array):void {
  if(y<1.20 || y>1.50 || Math.abs(x)>.24) return;
  for(const region of TORSO_LANDMARKS) addMuscleLobe(region,1,x,y,z,displacement,jacobian);
}
