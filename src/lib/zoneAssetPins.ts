/** Exact bytes of the local-only regional review. */
export const ZONE_ASSET_PINS = {
  "model": {
    "url": "/_bodyforge/review/foundation-zones-v4.glb",
    "bytes": 14719768,
    "sha256": "ac3582ac80564ad386a2e6b178ef9d1ef80baecc66f15ae8c41cd05b0bea1251"
  },
  "fields": {
    "url": "/_bodyforge/review/zone-fields-v4.bin",
    "bytes": 4083096,
    "sha256": "7ae100ed39c1bb46ba555637f500f61d312cd95c54d26d6fb9aa2047f2eed9ad"
  }
} as const;

/** V5 retains the pinned rest geometry; only the measured deformation fields differ. */
export const ZONE_ASSET_PINS_V5 = {
  model: ZONE_ASSET_PINS.model,
  fields: { url: "/_bodyforge/review/zone-fields-v5.bin", bytes: 4602748, sha256: "812e24f55a137afcda1d0cfc06b502680dff28249f66f28de1d9fd3c32b5b49d" },
} as const;

/** V10 offline-baked eyelid trajectory, loopback review only. */
export const BLINK_ASSET_PIN = { url: '/_bodyforge/review/blink-fields-v10.bin', bytes: 1161064, sha256: 'bc555c9b64821269ffc9deffab56cafe00737a9b601a02e6db6fcce63182324a' } as const;

/** V12 measured brow groom, loopback review only. */
export const BROW_ASSET_PIN = { url: '/_bodyforge/review/brows-v12.bin', bytes: 674216, sha256: '47fa746dc1f45e0e5f9914327c41d489b8a1c5772ab3dca5e31949a5c61dd5cb' } as const;

/** V13 validated eyelash trajectory, loopback review only. */
export const LASH_ASSET_PIN = { url: '/_bodyforge/review/lashes-v13.bin', bytes: 1826456, sha256: '7316a020ed6a74395c9555231010fa90721dfe9856c0a39728225a6542cf64e3' } as const;

/** V14 measured hair cards, buzz/crop/swept in this exact order. */
export const HAIR_ASSET_PINS = [
  { url: '/_bodyforge/review/hair-buzz-v14b.bin', bytes: 1488676, sha256: '0930dcd9db4ec47fb92cf3425c4c977cd42989a6303f251beb7b11101b55bdac' },
  { url: '/_bodyforge/review/hair-crop-v14b.bin', bytes: 1482844, sha256: '48ea16e6036fb51a30a7a32d0fbeab35bfcae1ec4fa378ab4a9d58319e59fd87' },
  { url: '/_bodyforge/review/hair-swept-v14b.bin', bytes: 1471828, sha256: '4b3dcf0e55144505acbb379cf64e34b7234ba9975899295f51cd3e47724104ab' },
] as const;

/** Existing licensed scan tile. See public/assets/athlete-scan-source.md. */
export const SKIN_SCAN_PIN={url:'/assets/athlete-scan-pores.png',bytes:61364,sha256:'56628fec1902669f0cabb7b2dcda7f5bc7837d042db81f068805aa2a3cae0685'} as const;

/** V20 animated measured aperture, loopback review only. */
export const EYE_APERTURE_PIN={url:'/_bodyforge/review/v17-eye-aperture.bin',bytes:21504,sha256:'e333f033d5737c6d7dfe1a37226e149d649e9fd77e0b45aeadd7363f714118fc'} as const;

/** V23 offline collision-screened lip compression; local review only. */
export const LIP_REPAIR_PIN={url:'/_bodyforge/review/v23-lip-compress65.bin',bytes:67028,sha256:'85ee73cd51102fc2584354670018faf3163cbbd0a6aa9fb9316c8028d3861d12'} as const;

/** V6 preview: V5b body plus collision-tested V5d garment shells. */
export const ZONE_ASSET_PINS_V6 = {
  model: { url: '/_bodyforge/review/foundation-zones-v6.glb', bytes: 14719772, sha256: '7dc94d5c9755fc6152c20120296d4a2213c18e59b2c970d658b4ef20e8247fa1' },
  fields: { url: '/_bodyforge/review/zone-fields-v6.bin', bytes: 4258496, sha256: '85344dd7f012f8a284b4fae5d3b28150615b9985e7f0141163ca05f483654331' },
} as const;

/** V24 collision-screened local shoulder field. Rest geometry is V6. */
export const ZONE_ASSET_PINS_V24 = {
  model: ZONE_ASSET_PINS_V6.model,
  fields: { url: '/_bodyforge/review/v24-fields-diffuse20.bin', bytes: 4452744, sha256: '4925275f728b70ed78b10c62fcdb7aae612f5c36f6266ca7ce4bd0120c68e531' },
} as const;

/** V26 sampled-contact-screened pectoral surface candidate; local opt-in only. */
export const ZONE_ASSET_PINS_V26 = {
  model: ZONE_ASSET_PINS_V6.model,
  fields: { url: '/_bodyforge/review/v26-fields-surface8b.bin', bytes: 4498384, sha256: '00d4ac77ff853c0c98f02ff46aeb73d5e200550088fce2d6e1ff7d936ee6865c' },
} as const;

/** V27 bounded-contact-screened pectoral transport candidate; local opt-in only. */
export const ZONE_ASSET_PINS_V27 = {
  model: ZONE_ASSET_PINS_V6.model,
  fields: { url: '/_bodyforge/review/v27-fields-upper30r20.bin', bytes: 4621504, sha256: '824a1024479f06540fb93594c9e7da75488060138ae6ee356860a5dd596a883f' },
} as const;

/** V28 bounded-contact-screened upper-arm volume redistribution; local opt-in only. */
export const ZONE_ASSET_PINS_V28 = {
  model: ZONE_ASSET_PINS_V6.model,
  fields: { url: '/_bodyforge/review/v28-fields-graph30protected.bin', bytes: 4678824, sha256: 'dc021c9671a4e89cbdd8f2444a9a3a718b8686adc5a1cb0414affec77d38ca27' },
} as const;
