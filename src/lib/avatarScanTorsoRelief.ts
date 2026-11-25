/** Local dev review of scan-informed torso relief.
 * Signed grid samples are in micrometres. Uniform cubic B-splines give
 * continuous first and second derivatives; the Jacobian is used for normals.
 * This is an artistic pose-dependent surface residual, not biomechanics.
 */
export interface ScanTorsoReviewField {
  readonly id: string;
  readonly x0: number;
  readonly y0: number;
  readonly step: number;
  readonly width: number;
  readonly height: number;
  readonly front: readonly number[];
  readonly back: readonly number[];
}

function weights(t:number): readonly number[] {
  return [(1-t)**3/6,(3*t**3-6*t*t+4)/6,(-3*t**3+3*t*t+3*t+1)/6,t**3/6];
}
function derivatives(t:number): readonly number[] {
  return [-.5*(1-t)**2,1.5*t*t-2*t,-1.5*t*t+t+.5,.5*t*t];
}
function smoothGate(z:number,a:number,b:number): [number,number] {
  if(z<=a)return [0,0];
  if(z>=b)return [1,0];
  const t=(z-a)/(b-a);
  return [t*t*(3-2*t),6*t*(1-t)/(b-a)];
}
function weight(n:number):number {
  return .30+.70*(Number.isFinite(n)?Math.max(0,Math.min(1,n)):0);
}

/** Add displacement and analytic spatial derivatives to the existing field.
 * A shared spatial field is evaluated on skin and clothing in bind space.
 * The non-overlapping depth gates keep core and back relief independent.
 */
export function addAvatarScanTorsoRelief(
  field:ScanTorsoReviewField,x:number,y:number,z:number,core:number,back:number,
  displacement:Float64Array,jacobian:Float64Array,
):void {
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))return;
  const gx=(x-field.x0)/field.step,gy=(y-field.y0)/field.step;
  if(gx<1||gx>=field.width-2||gy<1||gy>=field.height-2)return;
  let a:readonly number[], gate:number, dzGate:number, amplitude:number;
  if(z>.025){
    [gate,dzGate]=smoothGate(z,.025,.095);
    a=field.front;amplitude=weight(core);
  }else if(z<.005){
    const [v,d]=smoothGate(z,-.055,.005);
    gate=1-v;dzGate=-d;
    a=field.back;amplitude=weight(back);
  }else return;
  if(gate===0&&dzGate===0)return;
  const i=Math.floor(gx),k=Math.floor(gy),u=gx-i,v=gy-k;
  const wx=weights(u),wy=weights(v),dx=derivatives(u),dy=derivatives(v);
  let value=0,ddx=0,ddy=0;
  for(let r=0;r<4;r++)for(let c=0;c<4;c++){
    const q=a[(k+r-1)*field.width+i+c-1];
    value+=q*wx[c]*wy[r];
    ddx+=q*dx[c]*wy[r];
    ddy+=q*wx[c]*dy[r];
  }
  const metres=amplitude*1e-6;
  displacement[2]+=value*gate*metres;
  jacobian[6]+=ddx*gate*metres/field.step;
  jacobian[7]+=ddy*gate*metres/field.step;
  jacobian[8]+=value*dzGate*metres;
}
