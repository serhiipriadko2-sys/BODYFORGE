import type { Muscle } from './game';

type Vec3 = readonly [number, number, number];
export interface MuscleLobe {
  name: string;
  center: Vec3;
  radius: Vec3;
  offset: Vec3;
  /** Lateral and sagittal centreline slope per metre along bind-pose Y. */
  slope?: readonly [number, number];
}

/** Artistic muscle envelopes fitted to the pinned Blender-exported athlete.
 * Units are bind-pose metres, X lateral, Y vertical, +Z anterior. The same
 * field is evaluated on skin and garments. These are not biomechanical
 * muscle simulations, and do not change the four gameplay groups. */
export const MUSCLE_LOBES: Record<Muscle, readonly MuscleLobe[]> = {
  arms: [
    // Separate anterior, lateral and posterior heads, following the
    // upper-arm axis rather than inflating a single shoulder sphere.
    {name:'deltoid anterior',center:[.249,1.388,.060],radius:[.070,.087,.056],offset:[.007,0,.018],slope:[-.73,-.25]},
    {name:'deltoid lateral',center:[.275,1.395,.009],radius:[.073,.078,.077],offset:[.019,.004,0],slope:[-.85,0]},
    {name:'deltoid posterior',center:[.264,1.390,-.036],radius:[.065,.078,.059],offset:[.008,0,-.016],slope:[-.85,-.12]},
    {name:'biceps',center:[.318,1.310,.063],radius:[.064,.087,.074],offset:[.009,0,.024],slope:[-.90,-.30]},
    {name:'triceps',center:[.316,1.313,-.027],radius:[.065,.085,.065],offset:[.011,0,-.021],slope:[-.90,-.12]},
    {name:'brachioradialis',center:[.419,1.184,.100],radius:[.050,.060,.079],offset:[.013,0,.010],slope:[-.45,-.55]},
    {name:'forearm extensors',center:[.401,1.203,.037],radius:[.047,.062,.065],offset:[.009,0,-.008],slope:[-.60,-.80]},
  ],
  core: [
    // Chest belongs to the existing torso driver, not a new gameplay stat.
    {name:'pectoralis sternocostal',center:[.112,1.327,.122],radius:[.106,.071,.075],offset:[.004,0,.022],slope:[.10,-.25]},
    {name:'pectoralis clavicular',center:[.118,1.378,.115],radius:[.100,.052,.065],offset:[.002,.001,.014],slope:[.25,-.40]},
    {name:'serratus transition',center:[.152,1.253,.088],radius:[.058,.080,.067],offset:[.006,0,.009]},
    {name:'upper rectus',center:[.048,1.226,.136],radius:[.046,.039,.075],offset:[0,0,.014]},
    {name:'middle rectus',center:[.046,1.176,.135],radius:[.044,.039,.075],offset:[0,0,.014]},
    {name:'lower rectus',center:[.044,1.126,.132],radius:[.042,.044,.075],offset:[0,0,.012]},
    {name:'abdominal wall',center:[.053,1.177,.112],radius:[.052,.143,.107],offset:[0,0,.006]},
    {name:'external oblique',center:[.112,1.144,.072],radius:[.084,.144,.103],offset:[.008,0,.005],slope:[.12,-.15]},
  ],
  legs: [
    // Hip extensor/abductor and medial thigh volume. These compact supports
    // do not cross the midline, and follow the same field on skin and cloth.
    {name:'gluteus maximus',center:[.088,.947,-.094],radius:[.076,.100,.059],offset:[.003,0,-.019],slope:[-.12,.10]},
    {name:'gluteus medius',center:[.149,1.002,-.040],radius:[.058,.072,.080],offset:[.013,.001,-.006]},
    {name:'thigh adductors',center:[.064,.816,.053],radius:[.038,.088,.077],offset:[-.013,0,.002],slope:[-.24,0]},
    {name:'rectus femoris',center:[.128,.779,.104],radius:[.063,.169,.085],offset:[.003,0,.024],slope:[-.10,0]},
    {name:'vastus lateralis',center:[.177,.773,.061],radius:[.058,.158,.094],offset:[.016,0,.013],slope:[-.10,.10]},
    {name:'vastus medialis',center:[.093,.649,.080],radius:[.054,.099,.080],offset:[-.009,0,.016],slope:[-.08,.20]},
    {name:'hamstrings',center:[.139,.778,-.055],radius:[.083,.159,.092],offset:[.005,0,-.020]},
    {name:'gastrocnemius lateral',center:[.206,.409,-.053],radius:[.057,.125,.073],offset:[.013,0,-.021],slope:[-.08,-.10]},
    {name:'gastrocnemius medial',center:[.142,.376,-.057],radius:[.056,.138,.073],offset:[-.009,0,-.023],slope:[.04,-.12]},
    {name:'soleus',center:[.181,.295,-.043],radius:[.061,.099,.068],offset:[.004,0,-.010]},
    {name:'tibialis anterior',center:[.181,.375,.046],radius:[.045,.143,.055],offset:[.003,0,.010],slope:[-.11,.02]},
  ],
  back: [
    {name:'scapular plane',center:[.114,1.389,-.081],radius:[.100,.105,.083],offset:[.006,.001,-.017]},
    {name:'latissimus',center:[.145,1.285,-.072],radius:[.076,.151,.090],offset:[.019,0,-.017],slope:[.32,-.10]},
    {name:'latissimus flank',center:[.168,1.292,-.024],radius:[.072,.125,.079],offset:[.012,0,-.005],slope:[.28,-.12]},
    {name:'trapezius',center:[.077,1.452,-.063],radius:[.070,.083,.068],offset:[.003,.004,-.011]},
    {name:'spinal erectors',center:[.046,1.170,-.061],radius:[.043,.120,.053],offset:[0,0,-.009]},
  ],
};

/** Add a compact C2 envelope and its exact spatial Jacobian. Inclined
 * centrelines follow limb axes instead of inflating spherical joints.
 * The derivative is needed for continuous shading across UV split normals. */
export function addMuscleLobe(
  lobe: MuscleLobe, weight: number, x: number, y: number, z: number,
  displacement: Float64Array, jacobian: Float64Array,
): void {
  const side = x < 0 ? -1 : 1;
  const dy = y-lobe.center[1], sx=lobe.slope?.[0]??0, sz=lobe.slope?.[1]??0;
  const [rx,ry,rz] = lobe.radius;
  const u=(side*x-lobe.center[0]-sx*dy)/rx, v=dy/ry, w=(z-lobe.center[2]-sz*dy)/rz;
  const q=1-u*u-v*v-w*w;
  if (q<=0) return;
  const a=side*lobe.offset[0], b=lobe.offset[1], c=lobe.offset[2];
  const amount=weight*q*q*q;
  displacement[0]+=a*amount; displacement[1]+=b*amount; displacement[2]+=c*amount;
  const derivative=-6*weight*q*q;
  const gx=derivative*u*side/rx, gy=derivative*(v/ry-u*sx/rx-w*sz/rz), gz=derivative*w/rz;
  jacobian[0]+=a*gx; jacobian[1]+=a*gy; jacobian[2]+=a*gz;
  jacobian[3]+=b*gx; jacobian[4]+=b*gy; jacobian[5]+=b*gz;
  jacobian[6]+=c*gx; jacobian[7]+=c*gy; jacobian[8]+=c*gz;
}
