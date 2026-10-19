import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
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
  const [available, setAvailable] = useState(true);

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
      camera.position.set(0, 2.47, 9.20);
      camera.lookAt(0, 2.3, 0);
      const hemisphere = new THREE.HemisphereLight(0xffeedc, 0x263645, 1.35);
      scene.add(hemisphere);
      const warm = new THREE.DirectionalLight(0xffc79d, 2.8);
      warm.position.set(-4.5, 7, 6);
      scene.add(warm);
      const cool = new THREE.DirectionalLight(0x9bcce8, 1.55);
      cool.position.set(4, 5, -3);
      scene.add(cool);
      const rim = new THREE.PointLight(0xff682d, 24, 11);
      rim.position.set(-2.6, 2.35, -2);
      scene.add(rim);

      const stage = new THREE.Group();
      scene.add(stage);
      const pedestalMaterial = new THREE.MeshStandardMaterial({ color: 0x292d32, metalness: .82, roughness: .34 });
      const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xf58748, metalness: .73, roughness: .25, emissive: 0x8e2e10, emissiveIntensity: .45 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.78, 0.24, 44), pedestalMaterial);
      base.position.y = -0.12;
      stage.add(base);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(1.66, .045, 8, 64), edgeMaterial);
      edge.rotation.x = Math.PI / 2;
      edge.position.y = .015;
      stage.add(edge);
      const innerGlow = new THREE.Mesh(
        new THREE.CylinderGeometry(1.43, 1.43, .025, 40),
        new THREE.MeshBasicMaterial({ color: 0xf66f38, transparent: true, opacity: .075 }),
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
    <div className={`avatar-3d-shell ${className}`} data-3d-status="active">
      <div className="avatar-3d-embers" aria-hidden="true" />
      <canvas ref={canvas} aria-label="Объёмный 3D-персонаж BODYFORGE. Потяни пальцем влево или вправо, чтобы повернуть." role="img" />
      <span className="avatar-3d-drag">↔ ПОВЕРНИ ГЕРОЯ</span>
      <span className="avatar-3d-label">REAL 3D • FORGE ENGINE</span>
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

function makeFigure({ build, muscles, outfit }: FigureParams): THREE.Group {
  const arms = muscles.arms ?? 0;
  const core = muscles.core ?? 0;
  const legs = muscles.legs ?? 0;
  const back = muscles.back ?? 0;
  const solid = build === 'solid' ? 1 : 0;
  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  const skin = new THREE.MeshStandardMaterial({ color: 0xb98264, roughness: .58, metalness: .015 });
  const warmSkin = new THREE.MeshStandardMaterial({ color: 0xc99170, roughness: .60 });
  const skinShade = new THREE.MeshStandardMaterial({ color: 0x9b5e46, roughness: .68 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x191915, roughness: .92 });
  const faceDetail = new THREE.MeshStandardMaterial({ color: 0x3e2b23, roughness: .9 });
  const outfitColor = outfit === 'ember' ? 0xc85a32 : outfit === 'steel' ? 0x476875 : 0x323c43;
  const outfitAccent = outfit === 'ember' ? 0xffaa61 : outfit === 'steel' ? 0xa6e4ef : 0xe7a96b;
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
    const part = ball(name, (a.x+b.x)/2, (a.y+b.y)/2, (a.z+b.z)/2,
      width, a.distanceTo(b)*.64, depth, material);
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());
    return part;
  }
  const spread = solid ? .10 : 0;
  const legMass = legs*.042 + solid*.042;
  const waist = .52 + spread + core*.025;
  const shoulderRadius = .76 + back*.042 + solid*.10;

  // Legs: visible thighs, knees, sculpted calves and thick soles.
  for(const side of [-1, 1]) {
    const hip = side*(.42+spread*.35);
    const knee = side*.49;
    const ankle = side*.51;
    limb('thigh', [hip,2.22,.05],[knee,1.35,.10],.31+legMass,.30+legMass*.60,skin);
    ball('knee', knee,1.36,.11,.215+legMass*.35,.21,.22, skin);
    limb('shin',[knee,1.29,.04],[ankle,.47,.07],.195+legMass*.7,.215+legMass*.55,skin);
    ball('calf', side*.49,.91,-.11,.19+legMass*.75,.35,.18+legMass*.45,skin);
    ball('ankle', ankle,.33,.04,.17,.22,.19,skin);
    ball('shoe', ankle,.16,.26,.30,.19,.49,shoe);
    ball('sole',ankle,.075,.29,.315,.067,.49,shoeSole);
    ball('lace',ankle,.305,.45,.13,.017,.19,trim);
  }

  // Hips, belt and base clothing.
  ball('pelvis',0,2.28,0,.72+spread,.52,.39,skin);
  ball('shorts',0,2.29,.025,.70+spread,.43,.43,fabric);
  ball('shorts-underside',0,2.13,-.17,.65+spread,.22,.29,fabricShadow);
  ball('belt',0,2.57,.04,.69+spread,.08,.42,trim);
  ball('belt-clasp',0,2.58,.43,.12,.065,.032,shoeSole);
  for(const side of [-1,1]) {
    ball('short-leg',side*.44,2.06,.065,.34+legMass*.25,.31,.35,fabric);
    ball('short-hem',side*.45,1.85,.065,.34+legMass*.25,.045,.34,trim);
  }

  // Torso is a continuous sculpted lathe, not a flat plane.
  const torsoRings = [
    [waist*.67,2.51],[waist*.95,2.70],[waist,2.97],
    [.58+spread,3.16],[shoulderRadius*.92,3.43],
    [shoulderRadius,3.72],[.52+back*.02,3.92],
    [.27,4.0]
  ] as const;
  const lathe = new THREE.LatheGeometry(
    torsoRings.map(([r,y])=>new THREE.Vector2(r,y)),32,
  );
  const torso = new THREE.Mesh(lathe,skin);
  torso.name='muscular-torso';
  torso.scale.z = .67;
  group.add(torso);
  ball('abdomen',0,2.97,.15+solid*.04,waist*.91,.48,.18+solid*.05,skin);
  const chestMass=.04+back*.026;
  for(const side of [-1,1]){
    ball('pectoral',side*(.30+back*.014),3.49,.31,.32+chestMass,.18+back*.018,.17+chestMass*.5,skin);
    ball('collar',side*.27,3.89,.17,.33,.115,.28,skin);
  }
  // Rising muscle ridges. Higher core level changes real mesh depth.
  for(let row=0;row<3;row++){
    for(const side of [-1,1]){
      const b=ball('abdominal-ridge',side*.18,3.22-row*.225,.39+core*.005,
        .14+core*.008,.081+core*.007,.032+core*.018,
        core>=1 ? warmSkin : skin);
      b.visible=core>=1;
    }
  }
  for(const side of [-1,1]){
    ball('oblique',side*(waist-.055),2.99,.26,.16+core*.015,.31,.19,skinShade).material=skin;
  }
  // Shoulders and arms are individually reshaped with the "arms" stat.
  for(const side of [-1,1]){
    const sx=side*(shoulderRadius+.13);
    ball('shoulder',sx,3.67,.02,.295+arms*.032,.31+arms*.023,.305+arms*.026,skin);
    limb('upper-arm', [sx,3.54,.01],[side*(1.00+back*.018),2.88,.10],
      .245+arms*.038,.23+arms*.031,skin);
    ball('biceps',side*(1.02+back*.018),3.18,.145,.195+arms*.027,.29,.18+arms*.023,skin);
    ball('elbow',side*(1.02+back*.018),2.83,.09,.165+arms*.020,.17,.165,skin);
    limb('forearm',[side*(1.02+back*.018),2.82,.09],[side*1.03,2.16,.20],
      .19+arms*.020,.19+arms*.014,skin);
    ball('hand',side*1.03,2.02,.20,.17,.235,.14,skin);
    ball('wrist-wrap',side*1.03,2.33,.18,.195,.095,.20,trim);
  }

  // Neck and sculpted head: ears, jaw, facial details and hair.
  ball('neck',0,4.065,.04,.22,.28,.21,skinShade);
  ball('head',0,4.50,.09,.345,.445,.335,warmSkin);
  ball('jaw',0,4.29,.205,.235,.19,.23,skin);
  for(const side of [-1,1]){
    ball('ear',side*.36,4.48,.08,.09,.16,.10,skin);
    ball('eyebrow',side*.145,4.57,.402,.115,.023,.025,hair);
    ball('eye',side*.145,4.52,.418,.058,.026,.019,faceDetail);
    ball('cheek',side*.235,4.40,.30,.065,.14,.035,skin);
  }
  ball('nose',0,4.40,.418,.05,.108,.078,skin);
  ball('mouth',0,4.254,.472,.092,.018,.018,skinShade);
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(.362,24,12,0,Math.PI*2,0,Math.PI*.43),hair,
  );
  hairCap.position.set(0,4.555,.06);
  group.add(hairCap);
  ball('hair-wave',-.12,4.79,.18,.16,.082,.15,hair);

  // Outfits have visible 3D details instead of a texture-only color change.
  if(outfit!=='base'){
    for(const side of [-1,1]){
      ball('shoulder-brand',side*(shoulderRadius+.16),3.84,.25,.135,.055,.095,trim);
      ball('shin-brace',side*.51,.43,.22,.22,.1,.19,fabric);
      ball('shoe-plate',side*.51,.26,.59,.17,.045,.11,trim);
    }
  }
  // A chest emblem appears after a couple of upgrades.
  if(arms+back+core+legs>=8) {
    ball('forged-emblem',0,3.69,.49,.105,.105,.035,trim);
  }
  return group;
}

export default Avatar3D;
