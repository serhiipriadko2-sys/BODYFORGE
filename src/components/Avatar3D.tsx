import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import Avatar from './Avatar';
import type { BodyBuild, Muscle, Outfit } from '../lib/game';

interface Avatar3DProps {
  build: BodyBuild;
  muscles: Partial<Record<Muscle, number>>;
  outfit: Outfit;
  paused?: boolean;
  className?: string;
}

type FigureParams = Pick<Avatar3DProps, 'build' | 'muscles' | 'outfit'>;

interface ImportedFigure {
  root: THREE.Group;
  bones: THREE.Bone[];
  shorts: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  shoes: THREE.MeshStandardMaterial;
}

/**
 * Mobile-first procedural humanoid: real shaded three-dimensional meshes.
 * No external image CDN, animated rig, or access to the camera stream.
 */
export function Avatar3D({ build, muscles, outfit, paused = false, className = '' }: Avatar3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    figureRoot: THREE.Group;
    current: THREE.Group | null;
    stopped: () => void;
    redraw: () => void;
  } | null>(null);
  const pausedRef = useRef(paused);
  const figureSettingsRef = useRef<FigureParams>({ build, muscles, outfit });
  const importedRef = useRef<ImportedFigure | null>(null);
  figureSettingsRef.current = { build, muscles, outfit };
  const [available, setAvailable] = useState(true);
  const [modelSource, setModelSource] = useState<'procedural' | 'cc0'>('procedural');

  useEffect(() => {
    pausedRef.current = paused;
    runtime.current?.redraw();
  }, [paused]);

  useEffect(() => {
    const element = canvas.current as HTMLCanvasElement;
    if (!element) return;
    let renderer: THREE.WebGLRenderer | null = null;
    let animation: number | null = null;
    let visible = true;
    let disposed = false;
    let rotation = -0.21;
    let activePointer: number | null = null;
    let pointerX = 0;
    let isDragging = false;
    let lastDraw = 0;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas: element,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
        preserveDrawingBuffer: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
      camera.position.set(0, 2.40, 8.35);
      camera.lookAt(0, 2.38, 0);
      const hemisphere = new THREE.HemisphereLight(0xcbdfea, 0x243148, 1.35);
      scene.add(hemisphere);
      const warm = new THREE.DirectionalLight(0xffdec0, 2.35);
      warm.position.set(-4.5, 7, 6);
      scene.add(warm);
      const cool = new THREE.DirectionalLight(0x84b5df, 1.65);
      cool.position.set(4, 5, -3);
      scene.add(cool);
      const rim = new THREE.PointLight(0xf1b560, 16, 11);
      rim.position.set(-2.6, 2.35, -2);
      scene.add(rim);

      const stage = new THREE.Group();
      scene.add(stage);
      const pedestalMaterial = new THREE.MeshStandardMaterial({ color: 0x213245, metalness: .7, roughness: .4 });
      const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xf1bc65, metalness: .65, roughness: .32, emissive: 0x705025, emissiveIntensity: .24 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.78, 0.24, 44), pedestalMaterial);
      base.position.y = -0.12;
      stage.add(base);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(1.66, .045, 8, 64), edgeMaterial);
      edge.rotation.x = Math.PI / 2;
      edge.position.y = .015;
      stage.add(edge);
      const innerGlow = new THREE.Mesh(
        new THREE.CylinderGeometry(1.43, 1.43, .025, 40),
        new THREE.MeshBasicMaterial({ color: 0xf8c978, transparent: true, opacity: .045 }),
      );
      innerGlow.position.y = .015;
      stage.add(innerGlow);

      const figureRoot = new THREE.Group();
      figureRoot.rotation.y = rotation;
      stage.add(figureRoot);

      function redraw() {
        if (!disposed && renderer) {
          const rect = element.getBoundingClientRect();
          const w = Math.max(1, Math.round(rect.width));
          const h = Math.max(1, Math.round(rect.height));
          if (w > 1 && h > 1) {
            if (element.width !== Math.round(w * renderer.getPixelRatio()) ||
                element.height !== Math.round(h * renderer.getPixelRatio())) {
              renderer.setSize(w, h, false);
              camera.aspect = w / h;
              camera.updateProjectionMatrix();
            }
            renderer.render(scene, camera);
          }
        }
      }

      const onPointerDown = (event: PointerEvent) => {
        activePointer = event.pointerId;
        pointerX = event.clientX;
        isDragging = true;
        element.setPointerCapture(event.pointerId);
      };
      const onPointerMove = (event: PointerEvent) => {
        if (event.pointerId !== activePointer || !isDragging) return;
        rotation = THREE.MathUtils.clamp(rotation + (event.clientX - pointerX) * .011, -1.02, 1.02);
        pointerX = event.clientX;
        figureRoot.rotation.y = rotation;
        redraw();
      };
      const onPointerUp = (event: PointerEvent) => {
        if (event.pointerId === activePointer) {
          isDragging = false;
          activePointer = null;
          if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
        }
      };
      const onContextLost = (event: Event) => {
        event.preventDefault();
        console.warn('BODYFORGE 3D context lost');
        // A fallback replaces the canvas without unmounting this component.
        // Stop its runtime now, before later profile updates can redraw it.
        currentRuntime.stopped();
        setAvailable(false);
      };
      element.addEventListener('pointerdown', onPointerDown);
      element.addEventListener('pointermove', onPointerMove);
      element.addEventListener('pointerup', onPointerUp);
      element.addEventListener('pointercancel', onPointerUp);
      element.addEventListener('webglcontextlost', onContextLost);

      const onVisibility = () => {
        visible = !document.hidden && !!element.getBoundingClientRect().height;
        redraw();
      };
      document.addEventListener('visibilitychange', onVisibility);
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0]?.isIntersecting === true && !document.hidden;
        if (visible) redraw();
      }, { threshold: .01 });
      observer.observe(element);
      const resize = new ResizeObserver(redraw);
      resize.observe(element);

      function animate(time: number) {
        if (disposed) return;
        animation = requestAnimationFrame(animate);
        if (visible && !pausedRef.current && time - lastDraw > 42) {
          lastDraw = time;
          if (!isDragging && !prefersReducedMotion) {
            figureRoot.position.y = Math.sin(time / 1500) * .022;
          }
          redraw();
        }
      }
      const currentRuntime = {
        renderer,
        scene,
        camera,
        figureRoot,
        current: null as THREE.Group | null,
        redraw,
        stopped: () => {
          if (disposed) return;
          disposed = true;
          if (animation !== null) cancelAnimationFrame(animation);
          animation = null;
          if (runtime.current === currentRuntime) runtime.current = null;
          element.removeEventListener('pointerdown', onPointerDown);
          element.removeEventListener('pointermove', onPointerMove);
          element.removeEventListener('pointerup', onPointerUp);
          element.removeEventListener('pointercancel', onPointerUp);
          element.removeEventListener('webglcontextlost', onContextLost);
          document.removeEventListener('visibilitychange', onVisibility);
          observer.disconnect();
          resize.disconnect();
          disposeScene(scene);
          // Keep the canvas context valid across React StrictMode's
          // development-only effect cleanup/remount cycle.
          renderer?.dispose();
        },
      };
      runtime.current = currentRuntime;
      animation = requestAnimationFrame(animate);
      onVisibility();

      // Licensed CC0 MakeHuman asset. Swapped in only when the complete scene,
      // clothing and materials are ready; procedural human remains the fallback.
      new GLTFLoader().load(
        '/assets/male-base-mesh-base_male.glb',
        (gltf) => {
          if (disposed || runtime.current !== currentRuntime) {
            disposeScene(gltf.scene);
            return;
          }
          try {
            const imported = buildImportedFigure(gltf.scene, figureSettingsRef.current);
            if (currentRuntime.current) {
              currentRuntime.figureRoot.remove(currentRuntime.current);
              disposeScene(currentRuntime.current);
            }
            currentRuntime.figureRoot.add(imported.root);
            currentRuntime.current = imported.root;
            importedRef.current = imported;
            setModelSource('cc0');
            redraw();
          } catch (error) {
            console.warn('CC0 avatar unavailable, retaining procedural fallback:', error);
            disposeScene(gltf.scene);
          }
        },
        undefined,
        () => { /* Offline app keeps the procedural character. */ },
      );
    } catch (error) {
      console.error('BODYFORGE 3D renderer unavailable:', error);
      renderer?.dispose();
      if (!disposed) setAvailable(false);
    }

    return () => {
      runtime.current?.stopped();
      runtime.current = null;
    };
  }, []);

  useEffect(() => {
    const state = runtime.current;
    if (!state) return;
    if (importedRef.current) {
      styleImportedFigure(importedRef.current, { build, muscles, outfit });
      state.redraw();
      return;
    }
    if (state.current) {
      state.figureRoot.remove(state.current);
      disposeScene(state.current);
    }
    const mesh = makeFigure({ build, muscles, outfit });
    state.figureRoot.add(mesh);
    state.current = mesh;
    state.redraw();
  }, [build, muscles.arms, muscles.core, muscles.legs, muscles.back, outfit]);

  if (!available) {
    return (
      <div className={`avatar-3d-fallback ${className}`} data-3d-status="fallback">
        <Avatar workouts={0} build={build} muscles={muscles} outfit={outfit}/>
        <span>Устройство не поддерживает 3D — включён облегчённый персонаж</span>
      </div>
    );
  }

  return (
    <div className={`avatar-3d-shell ${className}`} data-3d-status="active" data-avatar-source={modelSource}>
      <div className="avatar-3d-embers" aria-hidden="true" />
      <canvas ref={canvas} aria-label="Объёмный 3D-персонаж BODYFORGE. Потяни пальцем влево или вправо, чтобы повернуть." role="img" />
      <span className="avatar-3d-drag">↔ ПОВЕРНИ ГЕРОЯ</span>
      <span className="avatar-3d-label">BODYFORGE / 3D БОЕЦ</span>
    </div>
  );
}

function disposeScene(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse((item) => {
    if (item instanceof THREE.Mesh) {
      geometries.add(item.geometry);
      const props = Array.isArray(item.material) ? item.material : [item.material];
      props.forEach((material) => materials.add(material));
    }
  });
  geometries.forEach((geo) => geo.dispose());
  materials.forEach((mat) => mat.dispose());
}


/** Anatomical CC0 GLB display. It is never sampled from the phone camera.
 * Cloth is added before the model replaces its procedural fallback. */
function buildImportedFigure(source: THREE.Group, settings: FigureParams): ImportedFigure {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // CC0 MakeHuman is authored in metres and has its feet at y=0.
  const box = new THREE.Box3().setFromObject(source);
  const bounds = box.getSize(new THREE.Vector3());
  if (bounds.y <= 0.1 || !Number.isFinite(bounds.y)) {
    throw new Error('CC0 character has invalid dimensions');
  }
  const scale = 4.75 / bounds.y;
  const centre = box.getCenter(new THREE.Vector3());
  source.scale.setScalar(scale);
  source.position.set(-centre.x * scale, -box.min.y * scale + .055, -centre.z * scale);
  body.add(source);

  const skin = new THREE.MeshStandardMaterial({
    color: 0xc59473, metalness: 0, roughness: .84,
  });
  const bones: THREE.Bone[] = [];
  source.traverse((node) => {
    if (node instanceof THREE.Bone) bones.push(node);
    if (node instanceof THREE.Mesh) {
      node.material = skin;
      node.castShadow = false;
      node.receiveShadow = true;
    }
  });

  const shorts = new THREE.MeshStandardMaterial({
    color: 0x202a35, metalness: 0.02, roughness: .93, side: THREE.DoubleSide,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x374350, roughness: .85, metalness: .025,
  });
  const shoes = new THREE.MeshStandardMaterial({
    color: 0x17222b, roughness: .72, metalness: .06,
  });

  const outfitGroup = new THREE.Group();
  body.add(outfitGroup);
  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    outfitGroup.add(mesh);
    return mesh;
  };
  const sphere = new THREE.SphereGeometry(1, 28, 18);
  // Softly rounded athletic shorts, with independent thigh openings rather
  // than a rigid rectangular box covering the anatomical base mesh.
  add('training-shorts', new THREE.LatheGeometry([
    new THREE.Vector2(.54, 2.10),
    new THREE.Vector2(.59, 2.16),
    new THREE.Vector2(.60, 2.34),
    new THREE.Vector2(.54, 2.49),
    new THREE.Vector2(.475, 2.60),
  ], 48), shorts, 0, 0, .012, 1, 1, .82);
  add('training-waistband',new THREE.CylinderGeometry(.48,.49,.050,40),trim,0,2.565,.015,1,1,.85);
  for (const side of [-1, 1]) {
    add('short-leg', new THREE.CylinderGeometry(.29, .31, .29, 40), shorts,
      side * .34, 2.055, .035, 1, 1, .88);
    add('short-seam',new THREE.CylinderGeometry(.306,.306,.014,40),trim,
      side * .34,1.907,.035,1,1,.88);
    add('training-shoe',sphere,shoes,side * .36,.145,.19,.255,.14,.37);
    add('shoe-sole',sphere,trim,side * .36,.067,.21,.26,.05,.38);
  }

  // Neutral, close-cut hair material: facial features remain those of
  // the original anatomical GLB rather than handmade spheres.
  const hair = new THREE.MeshStandardMaterial({ color: 0x191b21, roughness: .94 });
  add('short-hair',new THREE.SphereGeometry(.292,32,16,0,Math.PI*2,0,Math.PI*.43),
    hair,0,4.525,.02);

  const imported: ImportedFigure = { root, bones, shorts, trim, shoes };
  styleImportedFigure(imported, settings);
  return imported;
}

function styleImportedFigure(imported: ImportedFigure, { build, muscles, outfit }: FigureParams) {
  const arms = muscles.arms ?? 0;
  const core = muscles.core ?? 0;
  const legs = muscles.legs ?? 0;
  const back = muscles.back ?? 0;
  imported.root.scale.x = build === 'solid' ? 1.055 : 1;
  imported.shorts.color.setHex(outfit === 'ember' ? 0x764d39 :
    outfit === 'steel' ? 0x354e61 : 0x202a35);
  imported.trim.color.setHex(outfit === 'ember' ? 0xb68a58 :
    outfit === 'steel' ? 0x708b9d : 0x374350);
  imported.shoes.color.setHex(outfit === 'steel' ? 0x2c4457 : 0x17222b);
  for (const bone of imported.bones) {
    const name = bone.name.toLowerCase();
    let factor = 1;
    if (name.startsWith('upperarm')) factor = 1 + arms * .018;
    else if (name.startsWith('lowerarm')) factor = 1 + arms * .009;
    else if (name.startsWith('upperleg')) factor = 1 + legs * .019;
    else if (name.startsWith('lowerleg')) factor = 1 + legs * .009;
    else if (name === 'spine03' || name === 'spine04') factor = 1 + back * .013 + core * .008;
    else if (name === 'spine05') factor = 1 + back * .017;
    bone.scale.x = factor;
    bone.scale.z = factor;
  }
}

function makeFigure({ build, muscles, outfit }: FigureParams): THREE.Group {
  const arms = muscles.arms ?? 0;
  const core = muscles.core ?? 0;
  const legs = muscles.legs ?? 0;
  const back = muscles.back ?? 0;
  const solid = build === 'solid' ? 1 : 0;
  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 32, 24);
  // Restrained PBR skin and anatomy. Growth still follows game.muscles;
  // unlike the previous spherical joints, the figure reads as one human.
  const skin = new THREE.MeshStandardMaterial({ color: 0xb28468, roughness: .78, metalness: 0 });
  const warmSkin = new THREE.MeshStandardMaterial({ color: 0xbb8e73, roughness: .76, metalness: 0 });
  const skinShade = new THREE.MeshStandardMaterial({ color: 0x956650, roughness: .83, metalness: 0 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x202329, roughness: .94 });
  const faceDetail = new THREE.MeshStandardMaterial({ color: 0x382a28, roughness: .92 });
  const outfitColor = outfit === 'ember' ? 0x976742 : outfit === 'steel' ? 0x476275 : 0x1b2733;
  const outfitAccent = outfit === 'ember' ? 0xe6b46e : outfit === 'steel' ? 0xaccad8 : 0x9b805c;
  const fabric = new THREE.MeshStandardMaterial({ color: outfitColor, roughness: .71, metalness: .09 });
  const fabricShadow = new THREE.MeshStandardMaterial({ color: outfit === 'ember' ? 0x511e16 : 0x19242b, roughness: .72 });
  const trim = new THREE.MeshStandardMaterial({
    color: outfitAccent, metalness: outfit === 'base' ? .45 : .82, roughness: .22,
  });
  const shoe = new THREE.MeshStandardMaterial({ color: outfit === 'steel' ? 0x43525a : 0x1f272a, roughness: .55 });
  const shoeSole = new THREE.MeshStandardMaterial({ color: 0xd8c5aa, roughness: .68 });

  function ball(name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number,
    material: THREE.Material): THREE.Mesh {
    const part = new THREE.Mesh(sphere, material);
    part.name = name;
    part.position.set(x, y, z);
    part.scale.set(sx, sy, sz);
    group.add(part);
    return part;
  }
  function limb(name: string, start: [number, number, number], end: [number, number, number],
    width: number, depth: number, material: THREE.Material) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const length = a.distanceTo(b);
    // Smooth anatomical taper: continuous limb profile, not a scaled bead.
    // The ends overlap the joints, so the silhouette stays connected.
    const rings = [
      [-.52, .68], [-.44, .83], [-.29, .97],
      [-.1, 1], [.12, .94], [.33, .85], [.52, .72],
    ];
    const geometry = new THREE.LatheGeometry(
      rings.map(([offset, radius]) => new THREE.Vector2(width * radius, length * offset)), 32,
    );
    const part = new THREE.Mesh(geometry, material);
    part.name = name;
    part.position.copy(a).add(b).multiplyScalar(.5);
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    part.scale.z = depth / width;
    group.add(part);
    return part;
  }
  const spread = solid ? .065 : 0;
  const legMass = legs*.023 + solid*.025;
  const waist = .48 + spread + core*.022;
  const shoulderRadius = .66 + back*.025 + solid*.055;

  // Legs: visible thighs, knees, sculpted calves and thick soles.
  for(const side of [-1, 1]) {
    const hip = side*(.37+spread*.3);
    const knee = side*.385;
    const ankle = side*.405;
    limb('thigh', [hip,2.25,.035],[knee,1.34,.07],.258+legMass,.245+legMass*.58,skin);
    ball('knee', knee,1.35,.085,.176+legMass*.28,.165,.175, skin);
    limb('shin',[knee,1.29,.045],[ankle,.43,.04],.162+legMass*.45,.166+legMass*.48,skin);
    ball('calf', side*.398,.95,-.085,.168+legMass*.37,.255,.16+legMass*.3,skin);
    ball('ankle', ankle,.31,.05,.135,.18,.14,skin);
    ball('shoe', ankle,.145,.23,.255,.14,.39,shoe);
    ball('sole',ankle,.073,.24,.266,.047,.398,shoeSole);
    ball('lace',ankle,.255,.385,.095,.009,.13,shoeSole);
  }

  // Hips, belt and base clothing.
  ball('pelvis',0,2.28,0,.60+spread,.44,.32,skin);
  ball('shorts',0,2.26,.025,.585+spread,.33,.34,fabric);
  ball('shorts-underside',0,2.12,-.11,.56+spread,.18,.26,fabricShadow);
  ball('belt',0,2.54,.04,.57+spread,.049,.33,fabricShadow);
  for(const side of [-1,1]) {
    ball('short-leg',side*.36,2.04,.04,.285+legMass*.22,.24,.29,fabric);
    ball('short-hem',side*.36,1.88,.04,.283+legMass*.22,.022,.29,fabricShadow);
  }

  // Torso is a continuous sculpted lathe, not a flat plane.
  const torsoRings = [
    [waist*.65,2.51],[waist*.91,2.73],[waist,2.96],
    [.535+spread,3.16],[shoulderRadius*.94,3.45],
    [shoulderRadius,3.71],[.405+back*.012,3.91],
    [.205,4.015]
  ] as const;
  const lathe = new THREE.LatheGeometry(
    torsoRings.map(([r,y])=>new THREE.Vector2(r,y)),32,
  );
  const torso = new THREE.Mesh(lathe,skin);
  torso.name='muscular-torso';
  torso.scale.z = .67;
  group.add(torso);
  ball('abdomen',0,2.97,.16+solid*.03,waist*.89,.37,.125+solid*.03,skin);
  const chestMass=.022+back*.015;
  for(const side of [-1,1]){
    ball('pectoral',side*(.27+back*.008),3.52,.255,.282+chestMass,.145+back*.011,.119+chestMass*.4,skin);
    ball('collar',side*.23,3.88,.11,.25,.065,.20,skin);
  }
  // Rising muscle ridges. Higher core level changes real mesh depth.
  for(let row=0;row<3;row++){
    for(const side of [-1,1]){
      const b=ball('abdominal-ridge',side*.15,3.20-row*.20,.34+core*.005,
        .105+core*.006,.059+core*.005,.023+core*.012,
        core>=1 ? warmSkin : skin);
      b.visible=core>=1;
    }
  }
  for(const side of [-1,1]){
    ball('oblique',side*(waist-.09),2.99,.20,.115+core*.012,.24,.105,skin);
  }
  // Shoulders and arms are individually reshaped with the "arms" stat.
  for(const side of [-1,1]){
    const sx=side*(shoulderRadius+.08);
    ball('deltoid',sx,3.66,.0,.228+arms*.018,.237+arms*.017,.23+arms*.017,skin);
    limb('upper-arm',[sx,3.53,.005],[side*(.86+back*.012),2.88,.075],
      .174+arms*.020,.167+arms*.018,skin);
    ball('biceps',side*(.855+back*.012),3.19,.115,.153+arms*.02,.22,.139+arms*.015,skin);
    ball('elbow',side*(.86+back*.012),2.82,.075,.127+arms*.012,.13,.127,skin);
    limb('forearm',[side*(.86+back*.012),2.79,.07],[side*.88,2.15,.145],
      .131+arms*.013,.132+arms*.010,skin);
    ball('hand',side*.88,2.02,.155,.121,.176,.105,skin);
    if (outfit !== 'base') ball('wrist-guard',side*.88,2.30,.13,.15,.053,.155,trim);
  }

  // Neck and sculpted head: ears, jaw, facial details and hair.
  ball('neck',0,4.055,.02,.155,.215,.15,skinShade);
  ball('head',0,4.49,.07,.299,.381,.286,warmSkin);
  ball('jaw',0,4.27,.155,.205,.141,.202,skin);
  for(const side of [-1,1]){
    ball('ear',side*.298,4.46,.065,.052,.107,.057,skin);
    ball('eyebrow',side*.129,4.55,.345,.093,.017,.019,hair);
    ball('eye',side*.129,4.502,.357,.036,.019,.014,faceDetail);
  }
  ball('nose',0,4.395,.352,.040,.086,.058,skin);
  ball('mouth',0,4.265,.36,.072,.010,.014,skinShade);
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(.312,32,16,0,Math.PI*2,0,Math.PI*.38),hair,
  );
  hairCap.position.set(0,4.575,.064);
  group.add(hairCap);
  ball('hair-side',-.185,4.68,.055,.085,.14,.16,hair);

  // Outfits have visible 3D details instead of a texture-only color change.
  if(outfit!=='base'){
    for(const side of [-1,1]){
      ball('shoulder-brand',side*(shoulderRadius+.08),3.79,.18,.084,.026,.065,trim);
      ball('shin-brace',side*.405,.41,.16,.155,.064,.14,fabric);
      ball('shoe-plate',side*.405,.225,.52,.12,.025,.075,trim);
    }
  }
  // A chest emblem appears after a couple of upgrades.
  if(arms+back+core+legs>=8) {
    ball('forged-emblem',0,3.67,.40,.085,.085,.023,trim);
  }
  return group;
}

export default Avatar3D;
