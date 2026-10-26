import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ActiveFrameLoop } from '../lib/frameLoop';
import { disposeThreeTree } from '../lib/threeResources';
import { runtimeDiagnostics } from '../lib/runtimeDiagnostics';
import Avatar from './Avatar';
import type { BodyBuild, Muscle, Outfit } from '../lib/game';
import { DEFAULT_AVATAR_LOOK, HAIR_STYLES, lookColors, type AvatarLook, type HairStyle } from '../lib/avatarLook';
import { createAvatarHair } from '../lib/avatarHair';
import { clampAvatarYaw, INITIAL_AVATAR_YAW, stepAvatarYaw } from '../lib/avatarYaw';
import type { AvatarFocus } from './GameAvatar';

interface Avatar3DProps {
  build: BodyBuild;
  muscles: Partial<Record<Muscle, number>>;
  outfit: Outfit;
  paused?: boolean;
  className?: string;
  look?: AvatarLook;
  focus?: AvatarFocus;
  yaw?: number;
  onYawChange?: (angle: number) => void;
}

type FigureParams = Pick<Avatar3DProps, 'build' | 'muscles' | 'outfit' | 'look'>;

interface ImportedFigure {
  root: THREE.Group;
  bones: THREE.Bone[];
  shorts: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  shoes: THREE.MeshStandardMaterial;
  shirt: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
  hairStyles: Record<HairStyle, THREE.Group>;
  visor: THREE.Mesh;
  visorMaterial: THREE.MeshStandardMaterial;
  visorEdge: THREE.Mesh;
  visorEdgeMaterial: THREE.MeshStandardMaterial;
}

/**
 * Mobile-first procedural humanoid: real shaded three-dimensional meshes.
 * No external image CDN, animated rig, or access to the camera stream.
 */
export function Avatar3D({ build, muscles, outfit, look = DEFAULT_AVATAR_LOOK, focus = 'full',
  yaw = INITIAL_AVATAR_YAW, onYawChange, paused = false, className = '' }: Avatar3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    figureRoot: THREE.Group;
    current: THREE.Group | null;
    stopped: () => void;
    redraw: () => void;
    syncMotion: () => void;
    setView: (next: AvatarFocus) => void;
    setYaw: (next: number) => void;
    setAccent: (color: string) => void;
  } | null>(null);
  const pausedRef = useRef(paused);
  const onYawChangeRef = useRef(onYawChange);
  onYawChangeRef.current = onYawChange;
  const figureSettingsRef = useRef<FigureParams>({ build, muscles, outfit, look });
  const importedRef = useRef<ImportedFigure | null>(null);
  figureSettingsRef.current = { build, muscles, outfit, look };
  const [available, setAvailable] = useState(true);
  const [modelSource, setModelSource] = useState<'procedural' | 'cc0'>('procedural');

  useEffect(() => {
    pausedRef.current = paused;
    runtime.current?.syncMotion();
    runtime.current?.redraw();
  }, [paused]);

  useEffect(() => {
    const element = canvas.current as HTMLCanvasElement;
    if (!element) return;
    const telemetryId = runtimeDiagnostics.attachAvatar();
    let renderer: THREE.WebGLRenderer | null = null;
    let intersectsViewport = true;
    let visible = !document.hidden;
    let disposed = false;
    let rotation = clampAvatarYaw(yaw);
    let pointerStartYaw = rotation;
    let activePointer: number | null = null;
    let pointerX = 0;
    let isDragging = false;
    let lastDraw = 0;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

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
      const setView = (next: AvatarFocus) => {
        if (next === 'portrait') {
          camera.position.set(0, 4.37, 2.55);
          camera.lookAt(0, 4.42, 0);
        } else {
          camera.position.set(0, 2.40, 8.35);
          camera.lookAt(0, 2.38, 0);
        }
        element.dataset.avatarView = next;
        redraw();
      };
      const setYaw = (next: number) => {
        rotation = clampAvatarYaw(next);
        element.dataset.avatarYaw = String(rotation);
        figureRoot.rotation.y = rotation;
        redraw();
      };
      const setAccent = (color: string) => {
        const safe = /^#[0-9a-f]{6}$/i.test(color) ? color : '#55e3f2';
        edgeMaterial.color.set(safe);
        rim.color.set(safe);
        redraw();
      };

      function redraw() {
        // ResizeObserver, GLB loading and profile updates can redraw without RAF.
        // Apply the same visibility/camera pause boundary to these entry points.
        if (!disposed && renderer && visible && !document.hidden && !pausedRef.current) {
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
        pointerStartYaw = rotation;
        pointerX = event.clientX;
        isDragging = true;
        element.setPointerCapture(event.pointerId);
      };
      const onPointerMove = (event: PointerEvent) => {
        if (event.pointerId !== activePointer || !isDragging) return;
        rotation = stepAvatarYaw(rotation, (event.clientX - pointerX) * .011);
        pointerX = event.clientX;
        element.dataset.avatarYaw = String(rotation);
        figureRoot.rotation.y = rotation;
        redraw();
      };
      const onPointerUp = (event: PointerEvent) => {
        if (event.pointerId === activePointer) {
          const changed = isDragging && rotation !== pointerStartYaw;
          isDragging = false;
          activePointer = null;
          if (changed) onYawChangeRef.current?.(rotation);
          if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
        }
      };
      const onArrowKey = (event: KeyboardEvent) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        rotation = stepAvatarYaw(rotation, event.key === 'ArrowLeft' ? -.12 : .12);
        element.dataset.avatarYaw = String(rotation);
        figureRoot.rotation.y = rotation;
        onYawChangeRef.current?.(rotation);
        redraw();
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
      element.addEventListener('keydown', onArrowKey);
      element.addEventListener('webglcontextlost', onContextLost);

      const onVisibility = () => {
        visible = !document.hidden && intersectsViewport && element.getBoundingClientRect().height > 0;
        syncMotion();
        if (visible) redraw();
      };
      document.addEventListener('visibilitychange', onVisibility);
      motionPreference.addEventListener('change', onVisibility);
      const observer = new IntersectionObserver((entries) => {
        intersectsViewport = entries[0]?.isIntersecting === true;
        onVisibility();
      }, { threshold: .01 });
      observer.observe(element);
      const resize = new ResizeObserver(redraw);
      resize.observe(element);

      function animate(time: number) {
        if (time - lastDraw > 42) {
          lastDraw = time;
          if (!isDragging) figureRoot.position.y = Math.sin(time / 1500) * .022;
          redraw();
          if (renderer) runtimeDiagnostics.recordAvatarFrame(telemetryId, time, {
            drawCalls: renderer.info.render.calls,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
          });
        }
      }
      const frameLoop = new ActiveFrameLoop(
        animate,
        (callback) => window.requestAnimationFrame(callback),
        (id) => window.cancelAnimationFrame(id),
      );
      function syncMotion() {
        // Idle / hidden 3D must not schedule another RAF. Manual drag and
        // model updates still redraw on demand, including reduced-motion mode.
        const running = visible && !pausedRef.current && !motionPreference.matches && !disposed;
        frameLoop.setActive(running);
        element.dataset.renderLoop = running ? 'running' : 'paused';
      }
      const currentRuntime = {
        renderer,
        setView,
        setYaw,
        setAccent,
        scene,
        camera,
        figureRoot,
        current: null as THREE.Group | null,
        redraw,
        syncMotion,
        stopped: () => {
          if (disposed) return;
          disposed = true;
          frameLoop.stop();
          element.dataset.renderLoop = 'stopped';
          if (runtime.current === currentRuntime) {
            runtime.current = null;
            importedRef.current = null;
          }
          element.removeEventListener('pointerdown', onPointerDown);
          element.removeEventListener('pointermove', onPointerMove);
          element.removeEventListener('pointerup', onPointerUp);
          element.removeEventListener('pointercancel', onPointerUp);
          element.removeEventListener('keydown', onArrowKey);
          element.removeEventListener('webglcontextlost', onContextLost);
          document.removeEventListener('visibilitychange', onVisibility);
          motionPreference.removeEventListener('change', onVisibility);
          observer.disconnect();
          resize.disconnect();
          disposeThreeTree(scene);
          runtimeDiagnostics.detachAvatar(telemetryId);
          // Keep the canvas context valid across React StrictMode's
          // development-only effect cleanup/remount cycle.
          renderer?.dispose();
        },
      };
      runtime.current = currentRuntime;
      setView(focus);
      setYaw(yaw);
      setAccent(lookColors(look).trim);
      onVisibility();

      // Licensed CC0 MakeHuman asset. Swapped in only when the complete scene,
      // clothing and materials are ready; procedural human remains the fallback.
      const glbStartedAt = performance.now();
      new GLTFLoader().load(
        '/assets/male-base-mesh-base_male.glb',
        (gltf) => {
          if (disposed || runtime.current !== currentRuntime) {
            disposeThreeTree(gltf.scene);
            return;
          }
          try {
            const imported = buildImportedFigure(gltf.scene, figureSettingsRef.current);
            if (currentRuntime.current) {
              currentRuntime.figureRoot.remove(currentRuntime.current);
              disposeThreeTree(currentRuntime.current);
            }
            currentRuntime.figureRoot.add(imported.root);
            currentRuntime.current = imported.root;
            importedRef.current = imported;
            setModelSource('cc0');
            runtimeDiagnostics.recordGlbLoad(telemetryId, performance.now() - glbStartedAt);
            redraw();
          } catch (error) {
            console.warn('CC0 avatar unavailable, retaining procedural fallback:', error);
            disposeThreeTree(gltf.scene);
          }
        },
        undefined,
        () => { /* Offline app keeps the procedural character. */ },
      );
    } catch (error) {
      console.error('BODYFORGE 3D renderer unavailable:', error);
      renderer?.dispose();
      runtimeDiagnostics.detachAvatar(telemetryId);
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
    state.setAccent(lookColors(look).trim);
    if (importedRef.current) {
      styleImportedFigure(importedRef.current, { build, muscles, outfit, look });
      state.redraw();
      return;
    }
    if (state.current) {
      state.figureRoot.remove(state.current);
      disposeThreeTree(state.current);
    }
    const mesh = makeFigure({ build, muscles, outfit, look });
    state.figureRoot.add(mesh);
    state.current = mesh;
    state.redraw();
  }, [build, muscles.arms, muscles.core, muscles.legs, muscles.back, outfit, look]);

  useEffect(() => {
    runtime.current?.setView(focus);
    runtime.current?.setYaw(yaw);
  }, [focus, yaw]);

  if (!available) {
    return (
      <div className={`avatar-3d-fallback ${className}`} data-3d-status="fallback">
        <Avatar workouts={0} build={build} muscles={muscles} outfit={outfit} look={look}/>
        <span>Устройство не поддерживает 3D — включён облегчённый персонаж</span>
      </div>
    );
  }

  return (
    <div className={`avatar-3d-shell ${className}`} data-3d-status="active" data-avatar-source={modelSource}
      data-look-skin={look.skin} data-look-hair={look.hair} data-look-hair-style={look.hairStyle ?? 'crop'}
      data-look-trim={look.trim} data-look-visor={look.visor ? "on" : "off"}>
      <div className="avatar-3d-embers" aria-hidden="true" />
      <canvas ref={canvas} tabIndex={0} aria-keyshortcuts="ArrowLeft ArrowRight"
        aria-label="Объёмный 3D-персонаж BODYFORGE. Поверни пальцем или клавишами со стрелками влево и вправо." role="img" />
      <span className="avatar-3d-drag">↔ ПОВЕРНИ ГЕРОЯ</span>
      <span className="avatar-3d-label">BODYFORGE / 3D БОЕЦ</span>
    </div>
  );
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
  const shirt = new THREE.MeshStandardMaterial({ color: 0x18232e, roughness: .91, metalness: .015,
    side: THREE.DoubleSide });

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
  // Rounded upper yoke covers the bare shoulder seam seen in portrait view.
  add('jersey-shoulder-yoke', sphere, shirt, 0, 3.78, -.015, .685, .195, .31);
  // Fitted technical jersey over the CC0 anatomical torso. It deliberately
  // exists for every paid outfit, and has no effect on earned stats.
  add('technical-jersey', new THREE.LatheGeometry([
    new THREE.Vector2(.475, 2.57), new THREE.Vector2(.53, 2.68),
    new THREE.Vector2(.545, 3.04), new THREE.Vector2(.58, 3.23),
    new THREE.Vector2(.66, 3.51), new THREE.Vector2(.67, 3.67),
    new THREE.Vector2(.57, 3.80), new THREE.Vector2(.32, 3.94),
  ], 48), shirt, 0, 0, 0, 1, 1, .76);
  for (const side of [-1, 1]) {
    add('jersey-sleeve', sphere, shirt, side * .70, 3.63, -.018, .19, .187, .222);
    const piping = add('jersey-sleeve-piping',
      new THREE.CylinderGeometry(.219, .224, .014, 32), trim,
      side * .72, 3.465, .012, 1, 1, .97);
    piping.rotation.z = side * .18;
  }
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
  // All three hairstyles share the same validated hair material. Switching
  // visibility avoids remounting a large CC0 mesh and reallocating the GPU.
  const hairStyles = Object.fromEntries(HAIR_STYLES.map(({ id }) =>
    [id, createAvatarHair(id, hair, -.005)])) as Record<HairStyle, THREE.Group>;
  for (const style of Object.values(hairStyles)) outfitGroup.add(style);

  // Thin tinted glass with an independent emissive rim, not an opaque bar.
  const visorMaterial = new THREE.MeshStandardMaterial({ color: '#163448', metalness: .12, roughness: .22,
    transparent: true, opacity: .42, depthWrite: false });
  const visor = add('holo-visor-glass', new THREE.BoxGeometry(.62, .094, .04), visorMaterial, 0, 4.38, .34);
  const visorEdgeMaterial = new THREE.MeshStandardMaterial({ color: '#55e3f2', metalness: .36, roughness: .24,
    emissive: '#55e3f2', emissiveIntensity: .3 });
  const visorEdge = add('holo-visor-frame', new THREE.BoxGeometry(.64, .015, .053), visorEdgeMaterial, 0, 4.43, .35);
  const imported: ImportedFigure = { root, bones, shorts, trim, shoes, shirt, skin, hair,
    hairStyles, visor, visorMaterial, visorEdge, visorEdgeMaterial };
  styleImportedFigure(imported, settings);
  return imported;
}

function styleImportedFigure(imported: ImportedFigure, { build, muscles, outfit, look = DEFAULT_AVATAR_LOOK }: FigureParams) {
  const colors = lookColors(look);
  imported.skin.color.set(colors.skin);
  imported.hair.color.set(colors.hair);
  for (const style of HAIR_STYLES) imported.hairStyles[style.id].visible = style.id === (look.hairStyle ?? 'crop');
  imported.visorEdgeMaterial.color.set(colors.trim);
  imported.visorEdgeMaterial.emissive.set(colors.trim);
  imported.visor.visible = look.visor;
  imported.visorEdge.visible = look.visor;
  const arms = muscles.arms ?? 0;
  const core = muscles.core ?? 0;
  const legs = muscles.legs ?? 0;
  const back = muscles.back ?? 0;
  imported.root.scale.x = build === 'solid' ? 1.055 : 1;
  imported.shorts.color.setHex(outfit === 'ember' ? 0x764d39 :
    outfit === 'steel' ? 0x354e61 : 0x202a35);
  imported.trim.color.set(colors.trim);
  imported.shoes.color.setHex(outfit === 'steel' ? 0x2c4457 : 0x17222b);
  imported.shirt.color.setHex(outfit === 'ember' ? 0x423130 : outfit === 'steel' ? 0x233647 : 0x18232e);
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

function makeFigure({ build, muscles, outfit, look = DEFAULT_AVATAR_LOOK }: FigureParams): THREE.Group {
  const colors = lookColors(look);
  const base = new THREE.Color(colors.skin);
  const arms = muscles.arms ?? 0;
  const core = muscles.core ?? 0;
  const legs = muscles.legs ?? 0;
  const back = muscles.back ?? 0;
  const solid = build === 'solid' ? 1 : 0;
  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 32, 24);
  // Restrained PBR skin and anatomy. Growth still follows game.muscles;
  // unlike the previous spherical joints, the figure reads as one human.
  const skin = new THREE.MeshStandardMaterial({ color: base, roughness: .78, metalness: 0 });
  const warmSkin = new THREE.MeshStandardMaterial({ color: base.clone().lerp(new THREE.Color(0xffffff), .07), roughness: .76, metalness: 0 });
  const skinShade = new THREE.MeshStandardMaterial({ color: base.clone().lerp(new THREE.Color(0x000000), .22), roughness: .83, metalness: 0 });
  const hair = new THREE.MeshStandardMaterial({ color: colors.hair, roughness: .94 });
  const faceDetail = new THREE.MeshStandardMaterial({ color: 0x382a28, roughness: .92 });
  const outfitColor = outfit === 'ember' ? 0x976742 : outfit === 'steel' ? 0x476275 : 0x1b2733;
  const fabric = new THREE.MeshStandardMaterial({ color: outfitColor, roughness: .71, metalness: .09 });
  const fabricShadow = new THREE.MeshStandardMaterial({ color: outfit === 'ember' ? 0x511e16 : 0x19242b, roughness: .72 });
  const trim = new THREE.MeshStandardMaterial({
    color: colors.trim, metalness: outfit === 'base' ? .45 : .82, roughness: .22,
  });
  const shoe = new THREE.MeshStandardMaterial({ color: outfit === 'steel' ? 0x43525a : 0x1f272a, roughness: .55 });
  const jersey = new THREE.MeshStandardMaterial({ color: outfit === 'ember' ? 0x423130 : outfit === 'steel' ? 0x233647 : 0x18232e,
    roughness: .9, side: THREE.DoubleSide });
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
  // The same universal default workout jersey on procedural devices.
  const shirtGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(waist*.85,2.56),new THREE.Vector2(waist+ .055,2.71),
    new THREE.Vector2(waist+ .075,3.08),new THREE.Vector2(.59+spread,3.35),
    new THREE.Vector2(shoulderRadius+.035,3.66),new THREE.Vector2(.45,3.86),
    new THREE.Vector2(.25,3.99),
  ],32);
  const jerseyBody = new THREE.Mesh(shirtGeometry,jersey);
  jerseyBody.name='technical-jersey';
  jerseyBody.scale.z=.79;
  group.add(jerseyBody);
  ball('shirt-shoulder-yoke',0,3.81,.025,.69,.185,.31,jersey);
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
    ball('shirt-sleeve',sx,3.66,.0,.205,.18,.232,jersey);
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
  group.add(createAvatarHair(look.hairStyle ?? 'crop', hair, .064));
  if (look.visor) {
    const tinted = new THREE.MeshStandardMaterial({ color: '#203749', metalness: .12, roughness: .25,
      transparent: true, opacity: .42, depthWrite: false });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(.61, .085, .04), tinted);
    visor.name = 'holographic-visor';
    visor.position.set(0, 4.52, .366);
    group.add(visor);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(.62, .013, .05),
      new THREE.MeshStandardMaterial({ color: colors.trim, emissive: colors.trim, emissiveIntensity: .27 }));
    rim.name = 'visor-edge';
    rim.position.set(0, 4.57, .385);
    group.add(rim);
  }

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
