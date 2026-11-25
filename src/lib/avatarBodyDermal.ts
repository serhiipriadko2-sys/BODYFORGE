/**
 * BODYFORGE's packed skin vertices are in bind-pose metres. These artistic
 * region weights use measured mesh extents and knee/elbow/wrist landmarks.
 * They are not calibrated biophysical measurements. No new GPU attribute,
 * texture or per-frame computation is needed.
 */
export const BODY_DERMAL_REVISION = 'body-regions-v1';

const clamp = (v:number) => Math.min(1,Math.max(0,v));
const support = (x:number,y:number,z:number,cx:number,cy:number,cz:number,rx:number,ry:number,rz:number) => {
  const a=(x-cx)/rx,b=(y-cy)/ry,c=(z-cz)/rz;
  const f=Math.max(0,1-a*a-b*b-c*c);
  return f*f;
};

export function sampleBodyDermal(x:number,y:number,z:number): readonly [number,number,number] {
  if (![x,y,z].every(Number.isFinite) || y>=1.53) return [0,0,.5];
  const a=Math.abs(x);
  const knee=support(a,y,z,.151,.538,.073,.071,.078,.057);
  const elbow=support(a,y,z,.382,1.232,-.015,.080,.084,.066);
  const shin=support(a,y,z,.184,.323,.047,.073,.247,.073);
  const calf=support(a,y,z,.181,.396,-.045,.092,.167,.080);
  const forearm=support(a,y,z,.435,1.173,.102,.110,.118,.132);
  const wrist=support(a,y,z,.512,1.102,.218,.084,.068,.096);
  const hand=support(a,y,z,.548,1.035,.273,.085,.091,.136);
  const neck=support(a,y,z,.043,1.485,.047,.095,.078,.091);
  const chest=support(a,y,z,.081,1.333,.142,.153,.151,.098);
  // Smoothly match the pre-existing facial region field at the neck boundary.
  const t=clamp((1.53-y)/.035), fade=t*t*(3-2*t);
  const oil=.18*forearm+.15*wrist+.12*hand+.13*calf+.25*neck+.34*chest;
  const thin=.26*knee+.20*elbow+.17*shin+.16*forearm+.34*wrist+.29*hand+.33*neck;
  const pores=.30*knee+.29*elbow+.20*shin-.18*calf-.12*wrist+.17*hand-.13*neck+.11*chest;
  return [clamp(oil*fade),clamp(thin*fade),clamp(.5+pores*fade)];
}
