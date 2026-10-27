import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowRight, Award, CameraOff, Check, ChevronRight,
  CircleHelp, Clock3, Coins, Dumbbell, Flame, Info,
  Hammer, Medal, Play, RotateCcw, ShieldCheck, Smartphone, Target,
  Trophy, Volume2, VolumeX, WifiOff, X, Zap, UserRound,
} from 'lucide-react';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import GameAvatar from './components/GameAvatar';

const ProgressPulseBoard = lazy(() => import('./components/ProgressPulseBoard'));
const ProgressBackupPanel = lazy(() => import('./components/ProgressBackupPanel'));
const StepsBoard = lazy(() => import('./components/StepsBoard'));
import { useAvatarLook } from './hooks/useAvatarLook';
import AppearancePanel from './components/AppearancePanel';
import BrandMark from './components/BrandMark';
import Avatar from './components/Avatar';
import ForgeQuickDeck from './components/ForgeQuickDeck';
import ForgeGlyph from './components/ForgeGlyph';

import DailyPlanBoard from './components/DailyPlanBoard';
import { canStartCameraExercise, exerciseCameraLayout, exerciseGuide, exerciseTargetLabel, type ExerciseId } from './lib/trainingCatalog';
import { ExerciseMotionCounter, exerciseMetric } from './lib/exerciseCounter';
import './trainingExperience.css';
import { runtimeDiagnostics } from './lib/runtimeDiagnostics';
import StorageRecovery, { ResultQuarantineNotice } from './components/StorageRecovery';
import './recovery.css';
import { useProfileStorage } from './hooks/useProfileStorage';
import { withTimeout } from './lib/withTimeout';
import { DailyBoard, FighterSetup, ForgeStudio, OnlineBoard, TowerBoard } from './components/ForgeWorld';
import {
  buyOrEquipOutfit, claimDailyQuest, claimLogin, createFighter, ghostRepetitions,
  localDay, nextTowerFloor, TOWER_FLOORS, upgradeMuscle,
  type BodyBuild, type Muscle, type Outfit, type WorkoutMode,
} from './lib/game';
import {
  getProfileTotals, COIN_REWARD, formatTime, getLevel,
  getLevelProgress, getRank, TARGET_REPS, XP_REWARD,
} from './lib/progression';
import type { CompletedWorkoutResult, WorkoutSession } from './lib/workoutJournal';
import { SquatCounter, StableKneeTracker, type CounterFeedback, type CounterSnapshot, type PosePoint } from './lib/squatCounter';
import {
  cameraDeviceOptions, cameraOrientation, cameraZoomCapabilities, exerciseCameraConstraints,
  verifyCameraSelection, cameraSelectionFeedback,
  zoomConstraints, DEFAULT_CAMERA, VideoFrameGate, CameraFrameWatchdog,
  type CameraDeviceOption, type CameraOrientation, type CameraSource, type CameraZoom,
  type CameraSelectionVerification,
} from './lib/camera';
import { PoseGuidanceTracker, type PoseGuidance } from './lib/poseGuidance';
import { ExerciseFramingTracker } from './lib/exerciseFraming';
import { WorkoutWakeLock } from './lib/workoutWakeLock';

// Train-only panels stay out of the first mobile download.
const CameraControls = lazy(() => import('./components/CameraControls'));
const ExerciseCatalog = lazy(() => import('./components/ExerciseCatalog').then(({ ExerciseCatalog }) => ({ default: ExerciseCatalog })));
const RuntimeDiagnosticsPanel = lazy(() => import('./components/RuntimeDiagnosticsPanel'));

type Mode = 'idle' | 'loading' | 'active' | 'complete' | 'error';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const FIRST_SNAPSHOT: CounterSnapshot = {
  count: 0, phase: 'calibrate', feedback: 'stand', angle: null,
  counted: false, calibrated: false, standingAngle: null, depthTarget: null,
  returnTarget: null, lowestAngle: null,
};

const FEEDBACK: Record<CounterFeedback, string> = {
  'find-body': 'Не вижу колено: отойди дальше или повернись боком',
  stand: 'Встань прямо и постой неподвижно для калибровки',
  'go-down': 'Стойка найдена. Приседай до цели по углу',
  lower: 'Продолжай сгибать колени — нужен угол ниже цели',
  rise: 'Глубина достигнута! Теперь выпрями ноги',
  great: 'Присед засчитан! Следующий удар!',
};

const MOTION_HUD_CUES: Record<Exclude<ExerciseId, 'squat'>, { movement: string; focus: string }> = {
  lunge: { movement: 'СОГНИ КОЛЕНО И ВЫПРЯМИ ОБЕ НОГИ', focus: 'ОБЕ НОГИ В КАДРЕ' },
  pushup: { movement: 'СОГНИ И ВЫПРЯМИ РУКИ', focus: 'РУКИ, ТАЗ И СТОПЫ' },
  'jumping-jack': { movement: 'РУКИ ВВЕРХ / НОГИ ВРОЗЬ', focus: 'ОБЕ РУКИ И СТОПЫ' },
  'high-knees': { movement: 'ПОДНИМАЙ КОЛЕНИ ПО ОЧЕРЕДИ', focus: 'ОБА КОЛЕНА В КАДРЕ' },
  crunch: { movement: 'ПРИПОДНИМИ И ОПУСТИ ПЛЕЧИ', focus: 'ПЛЕЧО, ТАЗ И КОЛЕНИ' },
  'leg-raise': { movement: 'ПОДНИМИ И ОПУСТИ ПРЯМЫЕ НОГИ', focus: 'ТАЗ, КОЛЕНИ И СТОПЫ' },
  plank: { movement: 'ДЕРЖИ КОРПУС РОВНО 30 СЕКУНД', focus: 'ПЛЕЧО, ТАЗ И СТОПЫ' },
};

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Доступ к камере запрещён. Разреши камеру в настройках браузера и попробуй ещё раз.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'Камера не найдена. Подключи камеру или открой страницу на телефоне.';
  if (name === 'TimeoutError') return 'Камера или модель слишком долго не отвечает. Проверь разрешение и соединение, затем повтори попытку.';
  if (name === 'NotReadableError') return 'Камеру сейчас использует другое приложение. Закрой его и попробуй снова.';
  if (name === 'NetworkError') return 'Модуль распознавания не загрузился. Проверь интернет и обнови приложение.';
  if (name === 'OverconstrainedError') return 'Выбранный объектив или его настройки не поддерживаются. Выбери другую камеру.';
  return error instanceof Error ? `Не удалось запустить распознавание: ${error.message}` : 'Не удалось запустить камеру. Проверь соединение и разрешения.';
}

function playRepCue(audio: AudioContext | null, finalRep: boolean): void {
  if (!audio || audio.state !== 'running') return;
  try {
    const frequencies = finalRep ? [784, 1047] : [880];
    frequencies.forEach((frequency, index) => {
      const begins = audio.currentTime + index * 0.14;
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(frequency, begins);
      volume.gain.setValueAtTime(0.0001, begins);
      volume.gain.exponentialRampToValueAtTime(0.08, begins + 0.015);
      volume.gain.exponentialRampToValueAtTime(0.0001, begins + 0.11);
      tone.connect(volume);
      volume.connect(audio.destination);
      tone.start(begins);
      tone.stop(begins + 0.12);
    });
  } catch {
    // Missing audio support must never interrupt pose counting or rewards.
  }
}

function drawSkeleton(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, points: PosePoint[] | undefined, mirrored = true) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width === 0 || height === 0) return;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  if (!points) return;
  ctx.save();
  if (mirrored) { ctx.translate(width, 0); ctx.scale(-1, 1); }
  ctx.lineWidth = Math.max(3, width / 240);
  ctx.lineCap = 'round';
  const segments = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
  for (const [a, b] of segments) {
    const one = points[a];
    const two = points[b];
    if (!one || !two || (one.visibility ?? 1) < 0.4 || (two.visibility ?? 1) < 0.4) continue;
    ctx.strokeStyle = '#ff9854';
    ctx.beginPath();
    ctx.moveTo(one.x * width, one.y * height);
    ctx.lineTo(two.x * width, two.y * height);
    ctx.stroke();
  }
  for (const index of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    const point = points[index];
    if (!point || (point.visibility ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.fillStyle = '#ffe2c2';
    ctx.arc(point.x * width, point.y * height, Math.max(4, width / 180), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="BODYFORGE">
      <div className="brand-symbol"><BrandMark size={34} /></div>
      {!compact && <div className="brand-copy"><strong>BODY<span>FORGE</span></strong><small>ДВИЖЕНИЕ СОЗДАЁТ ФОРМУ</small></div>}
    </div>
  );
}

function CounterCircle({ count, active, target, label }: { count: number; active: boolean; target: number; label: string }) {
  const progress = Math.min(1, count / target);
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className={`counter-circle${active ? ' counter-circle-active' : ''}`}>
      <svg viewBox="0 0 180 180" aria-hidden="true">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#50392c" strokeWidth="7" />
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#ff8641" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} transform="rotate(-90 90 90)" />
        <circle cx="90" cy="90" r="55" stroke="#ffad6b" strokeOpacity=".09" strokeWidth="1" strokeDasharray="3 7" fill="none" />
      </svg>
      <div className="counter-inner"><span className="counter-number">{count}</span><span className="counter-divider" /><span className="counter-target">/ {target}</span><small>{label}</small></div>
    </div>
  );
}

function App() {
  const { profile, setProfile, status: storageStatus, backupAvailable, writeIssue, isSaving, pendingResult, journalEntries, quarantined, quarantine,
    beginWorkout, completeWorkout, openCurrent, retry: retryStorage, recover: recoverStorage, reload: reloadStorage } = useProfileStorage();
  const { look: avatarLook, readStatus: avatarLookStatus, message: avatarLookMessage, update: updateAvatarLook } = useAvatarLook();
  const [mode, setMode] = useState<Mode>('idle');
  const keepScreenAwake = mode === 'loading' || mode === 'active';
  // Keep the phone awake during the camera workout when the browser permits it.
  // The optional lock never controls counting, permissions, or reward storage.
  useEffect(() => {
    const wake = new WorkoutWakeLock(() => {
      if (!window.isSecureContext || !navigator.wakeLock?.request) {
        return Promise.reject(new Error('Screen Wake Lock unavailable'));
      }
      return navigator.wakeLock.request('screen');
    });
    const refresh = () => wake.setEnabled(keepScreenAwake && !document.hidden);
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      wake.setEnabled(false);
    };
  }, [keepScreenAwake]);
  const [snapshot, setSnapshot] = useState<CounterSnapshot>(FIRST_SNAPSHOT);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState('');
  const [lastResultMs, setLastResultMs] = useState<number | null>(null);
  const [section, setSection] = useState('dashboard');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [videoOrientation, setVideoOrientation] = useState<CameraOrientation>('unknown');
  const [cameraSource, setCameraSource] = useState<CameraSource>(DEFAULT_CAMERA);
  const [cameraVerification, setCameraVerification] = useState<CameraSelectionVerification>('unverified');
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceOption[]>([]);
  const [cameraZoom, setCameraZoom] = useState<CameraZoom | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraMirrored, setCameraMirrored] = useState(true);
  const [frameStalled, setFrameStalled] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [cameraModuleUnavailable, setCameraModuleUnavailable] = useState(false);
  const [showFullFrame, setShowFullFrame] = useState(false);
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>('training');
  const [previewExercise, setPreviewExercise] = useState<ExerciseId>('squat');
  const [activeExercise, setActiveExercise] = useState<ExerciseId>('squat');
  const [lastChallenge, setLastChallenge] = useState<{ mode: WorkoutMode; victory: boolean | null } | null>(null);
  const [today, setToday] = useState(() => new Date());
  const observedDay = useRef(localDay(today));
  // A daily reward must unlock after local midnight even if the app stays open.
  useEffect(() => {
    const refresh = () => {
      const now = new Date();
      const nextDay = localDay(now);
      // Keep the previously observed calendar key: reformatting the old Date
      // after a timezone change can hide a real change of the displayed day.
      if (observedDay.current !== nextDay) {
        observedDay.current = nextDay;
        setToday(now);
      }
    };
    const timer = window.setInterval(refresh, 30000);
    const visible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, []);

  const [trackingSide, setTrackingSide] = useState<'left' | 'right' | null>(null);
  const [poseFound, setPoseFound] = useState(false);
  const [poseGuidance, setPoseGuidance] = useState<PoseGuidance>(() => new PoseGuidanceTracker().reset());

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const frameRef = useRef<number | null>(null);
  const scanRef = useRef<((time: number) => void) | null>(null);
  const switchingRef = useRef(false);
  const zoomBusyRef = useRef(false);
  const counterRef = useRef(new SquatCounter());
  const motionRef = useRef<ExerciseMotionCounter | null>(null);
  const activeExerciseRef = useRef<ExerciseId>('squat');
  const workoutModeRef = useRef<WorkoutMode>('training');
  const splitsRef = useRef<number[]>([]);
  const kneeTrackerRef = useRef(new StableKneeTracker());
  const poseGuidanceRef = useRef(new PoseGuidanceTracker());
  const exerciseFramingRef = useRef(new ExerciseFramingTracker());
  const startedAtRef = useRef<number | null>(null);
  const aliveRef = useRef(false);
  const requestIdRef = useRef(0);
  const lastInferenceAtRef = useRef(0);
  const videoFramesRef = useRef(new VideoFrameGate());
  const captureRequestedRef = useRef(false);
  const frameWatchdogRef = useRef(new CameraFrameWatchdog());
  const stallReportedRef = useRef(false);
  const mirroredRef = useRef(true);
  const workoutSessionRef = useRef<WorkoutSession | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);



  const invalidateObservation = useCallback(() => {
    setFrameStalled(false);
    videoFramesRef.current.reset();
    frameWatchdogRef.current.reset();
    stallReportedRef.current = false;
    lastInferenceAtRef.current = 0;
    kneeTrackerRef.current.reset();
    const resetPose = poseGuidanceRef.current.reset();
    setPoseGuidance(activeExerciseRef.current === 'squat'
      ? resetPose : exerciseFramingRef.current.reset(activeExerciseRef.current));
    setTrackingSide(null);
    setPoseFound(false);
    setSnapshot(activeExerciseRef.current === 'squat'
      ? counterRef.current.recalibrate()
      : motionRef.current?.recalibrate().snapshot ?? FIRST_SNAPSHOT);
  }, []);

  const stopCapture = useCallback(() => {
    captureRequestedRef.current = false;
    aliveRef.current = false;
    setFrameStalled(false);
    switchingRef.current = false;
    zoomBusyRef.current = false;
    setCameraBusy(false);
    frameWatchdogRef.current.reset();
    stallReportedRef.current = false;
    requestIdRef.current++;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    scanRef.current = null;
    streamCleanupRef.current?.();
    streamCleanupRef.current = null;
    videoFramesRef.current.reset();
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const interruptCapture = useCallback((message: string) => {
    stopCapture();
    setError(message);
    setMode('error');
  }, [stopCapture]);

  useEffect(() => {
    const leave = () => {
      if (!captureRequestedRef.current) return;
      interruptCapture('Приложение ушло в фон. Камера остановлена без награды. Начни испытание заново.');
    };
    const visibility = () => { if (document.hidden) leave(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', leave);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', leave);
    };
  }, [interruptCapture]);

  useEffect(() => {
    if (storageStatus !== 'ready' && captureRequestedRef.current) {
      interruptCapture('Сохранение недоступно или изменилось. Камера остановлена, чтобы не потерять прогресс.');
    }
  }, [storageStatus, interruptCapture]);

  const refreshCameraDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameraDevices(cameraDeviceOptions(devices));
    } catch {
      // Some browsers expose only the current camera or hide device labels until permission.
    }
  }, []);

  useEffect(() => {
    void refreshCameraDevices();
    const media = navigator.mediaDevices;
    if (!media?.addEventListener) return;
    const changed = () => { void refreshCameraDevices(); };
    media.addEventListener('devicechange', changed);
    return () => media.removeEventListener('devicechange', changed);
  }, [refreshCameraDevices]);

  /** Single ownership point for camera tracks, shared by start and hot-switch.
   * Never trust deviceId to exist until the browser actually opens the stream. */
  const connectCamera = useCallback(async (source: CameraSource, requestId: number): Promise<MediaStream> => {
    const stream = await withTimeout(navigator.mediaDevices.getUserMedia(exerciseCameraConstraints(source, activeExerciseRef.current)), 20000, 'Camera permission timeout',
      (lateStream) => lateStream.getTracks().forEach((track) => track.stop()));
    if (requestId !== requestIdRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      throw new DOMException('Camera request cancelled', 'AbortError');
    }
    const video = videoRef.current;
    if (!video) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('Не найден видеоплеер');
    }
    try {
      streamRef.current = stream;
      video.srcObject = stream;
      await withTimeout(video.play(), 12000, 'Video playback timeout');
      if (requestId !== requestIdRef.current) {
        throw new DOMException('Camera request cancelled', 'AbortError');
      }
      setVideoOrientation(cameraOrientation(video.videoWidth, video.videoHeight));
      videoFramesRef.current.reset();
      const track = stream.getVideoTracks()[0];
      if (!track) throw new DOMException('No video track', 'NotFoundError');
      {
        // Track settings are optional device metadata. A privacy-restricted
        // browser must not lose an otherwise working workout if this throws.
        let settings: MediaTrackSettings = {};
        try { settings = track.getSettings() ?? {}; } catch { /* Keep capture alive. */ }
        setCameraVerification(verifyCameraSelection(source, settings));
        const facing = settings.facingMode;
        const mirrored = facing === 'user' || (facing !== 'environment' && source.kind === 'facing' && source.value === 'user');
        mirroredRef.current = mirrored;
        setCameraMirrored(mirrored);
        frameWatchdogRef.current.reset();
        stallReportedRef.current = false;
        const ownsStream = () => requestId === requestIdRef.current && streamRef.current === stream;
        const ended = () => {
          if (ownsStream()) interruptCapture('Камера отключилась во время испытания. Проверь её и начни заново.');
        };
        const muted = () => {
          if (!ownsStream()) return;
          invalidateObservation();
          setCameraMessage('Камера временно не передаёт кадры. Засчитанные повторы сохранены.');
        };
        const resumed = () => {
          if (!ownsStream()) return;
          invalidateObservation();
          setCameraMessage('Кадры снова поступают. Вернись в исходную позу для повторной калибровки.');
        };
        const resized = () => {
          if (!ownsStream()) return;
          setVideoOrientation(cameraOrientation(video.videoWidth, video.videoHeight));
          invalidateObservation();
        };
        track.addEventListener('ended', ended);
        track.addEventListener('mute', muted);
        track.addEventListener('unmute', resumed);
        video.addEventListener('resize', resized);
        streamCleanupRef.current = () => {
          track.removeEventListener('ended', ended);
          track.removeEventListener('mute', muted);
          track.removeEventListener('unmute', resumed);
          video.removeEventListener('resize', resized);
        };
        try {
          const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
            zoom?: { min: number; max: number; step?: number };
          };
          const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
          setCameraZoom(cameraZoomCapabilities(capabilities, settings));
        } catch {
          setCameraZoom(null);
        }
      }
      void refreshCameraDevices();
      return stream;
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      if (streamRef.current === stream) {
        streamCleanupRef.current?.();
        streamCleanupRef.current = null;
        streamRef.current = null;
      }
      if (video.srcObject === stream) video.srcObject = null;
      throw error;
    }
  }, [refreshCameraDevices, invalidateObservation, interruptCapture]);

  useEffect(() => () => {
    stopCapture();
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
  }, [stopCapture]);

  useEffect(() => {
    if (mode !== 'active') return;
    const id = window.setInterval(() => {
      if (startedAtRef.current !== null) setElapsedMs(performance.now() - startedAtRef.current);
    }, 60);
    return () => clearInterval(id);
  }, [mode]);

  // Keep the entire 9:16 window visible once a mobile workout starts.
  // The start button lives below the frame; without scrolling, the live count
  // may be hidden by the fixed bottom navigation.
  useEffect(() => {
    if (mode !== 'active' || !window.matchMedia('(max-width: 740px)').matches) return;
    const frame = requestAnimationFrame(() => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.querySelector('.training-visual')?.scrollIntoView({
        block: 'center',
        behavior: reduced ? 'instant' : 'smooth',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const cancel = useCallback(() => {
    stopCapture();
    counterRef.current.reset();
    motionRef.current?.reset();
    kneeTrackerRef.current.reset();
    const resetPose = poseGuidanceRef.current.reset();
    setPoseGuidance(activeExerciseRef.current === 'squat'
      ? resetPose : exerciseFramingRef.current.reset(activeExerciseRef.current));
    setTrackingSide(null);
    setPoseFound(false);
    startedAtRef.current = null;
    setElapsedMs(0);
    setSnapshot(FIRST_SNAPSHOT);
    setLastResultMs(null);
    setVideoOrientation('unknown');
    setCameraZoom(null);
    setCameraMessage('');
    setWorkoutMode('training');
    workoutModeRef.current = 'training';
    splitsRef.current = [];
    setError('');
    setMode('idle');
  }, [stopCapture]);

  const start = useCallback(async (requestedMode: WorkoutMode = 'training', explicitExercise?: ExerciseId) => {
    if (storageStatus !== 'ready' || captureRequestedRef.current) return;
    workoutSessionRef.current = null;
    if (isSaving) {
      setError('Дождись сохранения прогресса, затем начни испытание.');
      if (mode !== 'complete') setMode('error');
      return;
    }
    if (!profile.game.created) {
      // Keep the requested camera tab open; silently navigating home made
      // first-time phone users think the exercise screen had crashed.
      setError('Перед первым испытанием создай бойца на экране «Горн». Затем вернись во вкладку «Камера».');
      setMode('error');
      return;
    }
    workoutModeRef.current = requestedMode;
    setWorkoutMode(requestedMode);
    const exerciseId: ExerciseId = requestedMode === 'training' ? (explicitExercise ?? previewExercise) : 'squat';
    activeExerciseRef.current = exerciseId;
    setActiveExercise(exerciseId);
    motionRef.current = exerciseId === 'squat' ? null : new ExerciseMotionCounter(exerciseId);
    if (exerciseCameraLayout(exerciseId) === 'landscape') setShowFullFrame(true);
    splitsRef.current = [];
    setLastChallenge(null);
    stopCapture();
    counterRef.current.reset();
    motionRef.current?.reset();
    kneeTrackerRef.current.reset();
    const resetPose = poseGuidanceRef.current.reset();
    setPoseGuidance(activeExerciseRef.current === 'squat'
      ? resetPose : exerciseFramingRef.current.reset(activeExerciseRef.current));
    setTrackingSide(null);
    setPoseFound(false);
    startedAtRef.current = null;
    lastInferenceAtRef.current = 0;
    setSnapshot(FIRST_SNAPSHOT);
    setElapsedMs(0);
    setLastResultMs(null);
    setVideoOrientation('unknown');
    setCameraZoom(null);
    setCameraMessage('');
    setCameraModuleUnavailable(false);
    setError('');

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Для камеры нужен HTTPS или localhost. Открой приложение по защищённому адресу.');
      setMode('error');
      return;
    }

    // Start audio during the button gesture; some mobile browsers block it later.
    if (soundEnabled && typeof window.AudioContext === 'function') {
      try {
        const audio = audioRef.current ?? new window.AudioContext();
        audioRef.current = audio;
        void audio.resume().catch(() => {});
      } catch {
        // Camera counting continues silently when audio is unavailable.
      }
    }

    if (document.hidden) {
      setError('Вернись в приложение, чтобы начать испытание с камерой.');
      setMode('error');
      return;
    }
    captureRequestedRef.current = true;
    runtimeDiagnostics.startCameraSession();
    setMode('loading');
    const requestId = requestIdRef.current;
    let stream: MediaStream | null = null;
    let landmarker: PoseLandmarker | null = null;
    try {
      const session = await beginWorkout(requestedMode, exerciseId);
      if (requestId !== requestIdRef.current) return;
      if (!session) {
        stopCapture();
        setError('Не удалось подготовить сохранение тренировки. Проверь прогресс и повтори.');
        setMode('error');
        return;
      }
      workoutSessionRef.current = session;
      stream = await connectCamera(cameraSource, requestId);

      // Pose decoding is used only by workouts, never by the home/forge screens.
      // A dynamic import keeps its JavaScript outside the initial application chunk.
      let poseModule: typeof import('@mediapipe/tasks-vision');
      try {
        poseModule = await withTimeout(import('@mediapipe/tasks-vision'), 20000, 'Pose library download timeout');
      } catch (failure) {
        if (requestId !== requestIdRef.current) return;
        // Some browsers cache a failed import until the page is reloaded.
        setCameraModuleUnavailable(true);
        if (failure instanceof DOMException && failure.name === 'TimeoutError') throw failure;
        throw new DOMException('Pose module import failed', 'NetworkError');
      }
      if (requestId !== requestIdRef.current) return;
      const { FilesetResolver, PoseLandmarker } = poseModule;
      const vision = await withTimeout(FilesetResolver.forVisionTasks(WASM_URL), 30000, 'Pose runtime download timeout');
      if (requestId !== requestIdRef.current) return;
      const sharedOptions = {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: 'VIDEO' as const,
        numPoses: 1,
        minPoseDetectionConfidence: 0.55,
        minPosePresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      };
      try {
        landmarker = await withTimeout(PoseLandmarker.createFromOptions(vision, {
          ...sharedOptions,
          baseOptions: { ...sharedOptions.baseOptions, delegate: 'GPU' },
        }), 45000, 'Pose model timeout', (lateModel) => lateModel.close());
      } catch (failure) {
        if (failure instanceof DOMException && failure.name === 'TimeoutError') throw failure;
        if (requestId !== requestIdRef.current) return;
        landmarker = await withTimeout(PoseLandmarker.createFromOptions(vision, {
          ...sharedOptions,
          baseOptions: { ...sharedOptions.baseOptions, delegate: 'CPU' },
        }), 45000, 'Pose CPU model timeout', (lateModel) => lateModel.close());
      }
      if (requestId !== requestIdRef.current) {
        landmarker.close();
        return;
      }
      landmarkerRef.current = landmarker;
      aliveRef.current = true;
      setMode('active');

      const scan = (time: number) => {
        if (requestId !== requestIdRef.current || !aliveRef.current || !landmarkerRef.current || !videoRef.current) return;
        if (document.hidden) {
          interruptCapture('Приложение ушло в фон. Камера остановлена без награды. Начни испытание заново.');
          return;
        }
        const liveVideo = videoRef.current;
        const liveTrack = streamRef.current?.getVideoTracks()[0];
        if (!liveTrack || liveTrack.readyState !== 'live') {
          interruptCapture('Камера отключилась во время испытания. Проверь её и начни заново.');
          return;
        }
        if (!liveTrack.muted && liveVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            time - lastInferenceAtRef.current >= 90 && videoFramesRef.current.accept(liveVideo.currentTime)) {
          lastInferenceAtRef.current = time;
          frameWatchdogRef.current.observe(true, time);
          if (stallReportedRef.current) {
            setFrameStalled(false);
            setCameraMessage('Кадры снова поступают. Вернись в исходную позу для повторной калибровки.');
          }
          stallReportedRef.current = false;
          try {
            const inferenceStarted = performance.now();
            const result = landmarkerRef.current.detectForVideo(liveVideo, time);
            runtimeDiagnostics.recordInference(performance.now() - inferenceStarted, time);
            const points = result.landmarks[0] as PosePoint[] | undefined;
            drawSkeleton(canvasRef.current, liveVideo, points, mirroredRef.current);
            const currentId = activeExerciseRef.current;
            const ratio = liveVideo.videoWidth / liveVideo.videoHeight;
            let next: CounterSnapshot;
            if (currentId === 'squat') {
              const measured = kneeTrackerRef.current.update(points ?? [], ratio);
              setPoseGuidance(poseGuidanceRef.current.update(points, measured.angle, time));
              setTrackingSide(measured.side);
              next = counterRef.current.update(measured.angle, time, measured.side);
            } else {
              const detector = motionRef.current;
              if (!detector) throw Error('Exercise detector unavailable');
              const reading = detector.update(points ?? [], time, ratio);
              next = reading.snapshot;
              setTrackingSide(reading.side);
              // Per-exercise, debounced camera hints do not affect counting.
              setPoseGuidance(exerciseFramingRef.current.update(currentId, points, time, ratio));
            }
            setPoseFound(Boolean(points?.length));
            setSnapshot(next);
            const target = exerciseGuide(currentId).target;
            if (next.counted) {
              if (currentId !== 'plank' && startedAtRef.current !== null)
                splitsRef.current.push(Math.max(0, time - startedAtRef.current));
              if (soundEnabled && (currentId !== 'plank' || next.count % 5 === 0 || next.count >= target))
                playRepCue(audioRef.current, next.count >= target);
            }
            if (next.calibrated && startedAtRef.current === null) startedAtRef.current = time;
            if (next.count >= target) {
              const durationMs = Math.max(1, time - (startedAtRef.current ?? time));
              setElapsedMs(durationMs);
              setLastResultMs(durationMs);
              const selectedMode = workoutModeRef.current;
              const session = workoutSessionRef.current;
              if (!session) throw Error('Workout session unavailable');
              const floor = TOWER_FLOORS.find((f) => f.floor === session.floor) ?? nextTowerFloor(profile.game);
              const victory = selectedMode === 'tower'
                ? profile.game.highestClearedFloor < TOWER_FLOORS.length && durationMs <= floor.targetMs
                : selectedMode === 'ghost' && profile.game.bestGhost
                  ? durationMs < profile.game.bestGhost.durationMs : null;
              setLastChallenge({ mode: selectedMode, victory });
              // Freeze completion once, outside React's updater (StrictMode may invoke twice).
              const finishedAt = new Date();
              const completed: CompletedWorkoutResult = {
                ...session, durationMs, finishedAt: finishedAt.toISOString(),
                repetitions: currentId === 'plank' ? 0 : 20,
                ...(currentId === 'plank' ? { holdSeconds: 30 as const } : { splitsMs: [...splitsRef.current] }),
              };
              setToday(new Date());
              stopCapture();
              setMode('complete');
              void completeWorkout(completed);
              return;
            }
          } catch (failure) {
            setError(cameraErrorMessage(failure));
            stopCapture();
            setMode('error');
            return;
          }
        } else if (frameWatchdogRef.current.observe(false, time) && !stallReportedRef.current) {
          // Do NOT reset VideoFrameGate here: that would accept the same frozen
          // image as fresh on the next tick and resurrect an obsolete pose.
          stallReportedRef.current = true;
          setFrameStalled(true);
          kneeTrackerRef.current.reset();
          setSnapshot(activeExerciseRef.current === 'squat'
      ? counterRef.current.recalibrate()
      : motionRef.current?.recalibrate().snapshot ?? FIRST_SNAPSHOT);
          const resetPose = poseGuidanceRef.current.reset();
    setPoseGuidance(activeExerciseRef.current === 'squat'
      ? resetPose : exerciseFramingRef.current.reset(activeExerciseRef.current));
          setTrackingSide(null);
          setPoseFound(false);
          drawSkeleton(canvasRef.current, liveVideo, undefined, mirroredRef.current);
          setCameraMessage('Кадр камеры завис. Счётчик ждёт новое изображение; выполненные повторы сохранены.');
        }
        frameRef.current = requestAnimationFrame(scan);
      };
      scanRef.current = scan;
      frameRef.current = requestAnimationFrame(scan);
    } catch (failure) {
      if (requestId !== requestIdRef.current) {
        landmarker?.close();
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      setError(cameraErrorMessage(failure));
      stopCapture();
      setMode('error');
    }
  }, [stopCapture, soundEnabled, profile.game, connectCamera, cameraSource, interruptCapture, storageStatus, isSaving, mode, beginWorkout, completeWorkout, previewExercise]);

  /** Zoom uses the real capture track, never CSS stretching of the skeleton. */
  const changeCameraZoom = useCallback(async (requested: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || mode !== 'active' || !cameraZoom || switchingRef.current || zoomBusyRef.current) return;
    if (!Number.isFinite(requested)) return;
    const requestId = requestIdRef.current;
    const zoom = Math.min(cameraZoom.max, Math.max(cameraZoom.min, requested));
    aliveRef.current = false;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    invalidateObservation();
    zoomBusyRef.current = true;
    setCameraBusy(true);
    try {
      await withTimeout(track.applyConstraints(zoomConstraints(zoom)), 8000, 'Zoom timeout');
      if (streamRef.current?.getVideoTracks()[0] !== track) return;
      const actual = (track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom;
      if (typeof actual !== 'number' || Math.abs(actual - zoom) > Math.max(.11, cameraZoom.step * 1.6)) {
        setCameraMessage('Браузер не применил выбранный масштаб. Попробуй другой объектив.');
        return;
      }
      setCameraZoom((previous) => previous ? { ...previous, current: actual } : null);
      if (actual < .95) setShowFullFrame(true);
      invalidateObservation();
      setCameraMessage('Масштаб изменён. Вернись в исходную позу. Повторы сохраняются; удержание планки начинается заново.');
    } catch (failure) {
      if (requestId !== requestIdRef.current) return;
      if (failure instanceof DOMException && failure.name === 'TimeoutError') {
        interruptCapture('Камера не завершила изменение масштаба. Попытка остановлена без награды.');
        return;
      }
      setCameraMessage('Этот масштаб недоступен в браузере телефона.');
    } finally {
      if (requestId === requestIdRef.current && streamRef.current?.getVideoTracks()[0] === track) {
        zoomBusyRef.current = false;
        setCameraBusy(false);
        invalidateObservation();
        aliveRef.current = true;
        if (scanRef.current) frameRef.current = requestAnimationFrame(scanRef.current);
      }
    }
  }, [mode, cameraZoom, invalidateObservation, interruptCapture]);

  /** On mobile, switching lenses releases the previous track before opening a
   * new one. The elapsed timer continues. Already-counted reps are preserved. */
  const chooseCamera = useCallback(async (nextSource: CameraSource) => {
    if (mode === 'loading' || switchingRef.current || zoomBusyRef.current) return;
    const unchanged = cameraSource.kind === nextSource.kind && cameraSource.value === nextSource.value;
    if (mode !== 'active') {
      setCameraSource(nextSource);
      setCameraVerification('unverified');
      if (nextSource.kind === 'device' &&
          cameraDevices.some((device) => device.deviceId === nextSource.value && device.ultraWide)) {
        setShowFullFrame(true);
      }
      setCameraMessage('Камера будет выбрана при следующем запуске.');
      return;
    }
    if (unchanged) {
      if (cameraZoom && cameraZoom.current < .96 && cameraZoom.min <= 1 && cameraZoom.max >= 1) {
        await changeCameraZoom(1);
      }
      return;
    }
    if (!streamRef.current || !scanRef.current) return;

    switchingRef.current = true;
    setCameraBusy(true);
    setCameraVerification('unverified');
    setCameraMessage('Переключаем объектив…');
    const requestId = requestIdRef.current;
    aliveRef.current = false;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const previousStream = streamRef.current;
    streamCleanupRef.current?.();
    streamCleanupRef.current = null;
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    previousStream.getTracks().forEach((track) => track.stop());

    const resume = (source: CameraSource) => {
      if (requestId !== requestIdRef.current) return;
      setCameraSource(source);
      invalidateObservation();
      aliveRef.current = true;
      if (scanRef.current) frameRef.current = requestAnimationFrame(scanRef.current);
    };

    try {
      const openedStream = await connectCamera(nextSource, requestId);
      if (requestId !== requestIdRef.current) return;
      let verification: CameraSelectionVerification = 'unverified';
      try {
        verification = verifyCameraSelection(nextSource, openedStream.getVideoTracks()[0]?.getSettings());
      } catch {
        // Browser privacy APIs may hide track metadata. Never infer a real lens.
      }
      setCameraVerification(verification);
      resume(nextSource);
      if (nextSource.kind === 'device' &&
          cameraDevices.some((device) => device.deviceId === nextSource.value && device.ultraWide)) {
        setShowFullFrame(true);
      }
      setCameraMessage(cameraSelectionFeedback(nextSource, verification));
    } catch (failure) {
      if (requestId !== requestIdRef.current) return;
      try {
        await connectCamera(cameraSource, requestId);
        if (requestId !== requestIdRef.current) return;
        resume(cameraSource);
        setCameraMessage('Не удалось открыть выбранный объектив. Вернули предыдущую камеру.');
      } catch {
        if (requestId !== requestIdRef.current) return;
        stopCapture();
        setError(cameraErrorMessage(failure));
        setMode('error');
      }
    } finally {
      if (requestId === requestIdRef.current) { switchingRef.current = false; setCameraBusy(false); }
    }
  }, [mode, cameraSource, cameraDevices, cameraZoom, connectCamera, changeCameraZoom, stopCapture, invalidateObservation]);

  const level = getLevel(profile.xp);
  const levelPercent = Math.round(getLevelProgress(profile.xp) * 100);
  const totals = useMemo(() => getProfileTotals(profile), [profile]);
  const best = totals.bestDurationMs;
  const repetitionsDone = totals.repetitions;
  const workoutCount = totals.workouts;
  const isCameraShown = mode === 'loading' || mode === 'active';
  const displayTime = mode === 'complete' ? (lastResultMs ?? 0) : elapsedMs;
  const selectedExercise = mode === 'idle' || mode === 'error' ? previewExercise : activeExercise;
  const exercise = exerciseGuide(selectedExercise);
  const diagnostic = exerciseMetric(selectedExercise);

  function navigate(id: string) {
    if ((mode === 'active' || mode === 'loading') && id !== 'challenge') return;
    const destination = id === 'onboarding' ? 'dashboard' : id;
    if (destination !== 'challenge' && mode === 'error') {
      // A stale camera error must not survive creating a fighter or switching tabs.
      setError('');
      setMode('idle');
    }
    setSection(destination);
    if (window.matchMedia('(max-width: 740px)').matches) {
      // True mobile tabs: reveal the selected screen, then return to its top.
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function goTraining(requestedMode: WorkoutMode = 'training', explicitExercise?: ExerciseId) {
    // Quick-start buttons labelled «приседания» request a squat explicitly.
    // Do not rely on setState to propagate before start(), or a prior plank may run instead.
    const exerciseId = requestedMode === 'training' ? (explicitExercise ?? previewExercise) : 'squat';
    setPreviewExercise(exerciseId);
    navigate('challenge');
    void start(requestedMode, exerciseId);
  }

  const frozenFloor = workoutSessionRef.current?.mode === 'tower' && mode !== 'idle' ? workoutSessionRef.current.floor : null;
  const selectedFloor = frozenFloor ? TOWER_FLOORS.find((floor) => floor.floor === frozenFloor) ?? nextTowerFloor(profile.game) : nextTowerFloor(profile.game);
  const opponentReps = mode === 'active' && workoutMode === 'tower'
    ? Math.min(TARGET_REPS, Math.floor(elapsedMs / (selectedFloor.targetMs / TARGET_REPS)))
    : mode === 'active' && workoutMode === 'ghost' && profile.game.bestGhost
      ? ghostRepetitions(profile.game.bestGhost.splitsMs, elapsedMs) : 0;
  const canNavigate = mode !== 'active' && mode !== 'loading';
  const showTrainingPanels = section === 'challenge' || mode === 'active' || mode === 'loading' ||
    window.matchMedia('(min-width: 741px)').matches;

  if (storageStatus !== 'ready') return <StorageRecovery status={storageStatus} backupAvailable={backupAvailable}
    writeIssue={writeIssue} isSaving={isSaving} profile={profile} pendingResult={pendingResult} journalEntries={journalEntries}
    onOpenCurrent={openCurrent} onRetry={retryStorage} onRecover={recoverStorage} onReload={reloadStorage} onQuarantine={quarantine}/>;

  return (
    <div className="app-shell" data-screen={section} data-fighter-created={profile.game.created ? 'true' : 'false'}>
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-section-label">НАВИГАЦИЯ КУЗНИ</div>
        <nav className="nav-items" aria-label="Навигация">
          <button disabled={!canNavigate} className={`nav-item${section === 'dashboard' ? ' selected' : ''}`} aria-current={section === 'dashboard' ? 'page' : undefined} onClick={() => navigate('dashboard')}><ForgeGlyph name="home" size={19} /> <span>Горн</span><span className="nav-selected-dot" /></button>
          <button className={`nav-item${section === 'challenge' ? ' selected' : ''}`} aria-current={section === 'challenge' ? 'page' : undefined} onClick={() => navigate('challenge')}><ForgeGlyph name="scan" size={19} /> <span>Тренировка</span><span className="nav-selected-dot" /></button>
          <button disabled={!canNavigate} className={`nav-item${section === 'forge' ? ' selected' : ''}`} aria-current={section === 'forge' ? 'page' : undefined} onClick={() => navigate('forge')}><ForgeGlyph name="body" size={19} /> <span>Персонаж</span><span className="nav-selected-dot" /></button>
          <button disabled={!canNavigate} className={`nav-item${section === 'tower' ? ' selected' : ''}`} aria-current={section === 'tower' ? 'page' : undefined} onClick={() => navigate('tower')}><ForgeGlyph name="tower" size={19} /> <span>Башня</span><span className="nav-selected-dot" /></button>
          <button disabled={!canNavigate} className={`nav-item${section === 'online' ? ' selected' : ''}`} aria-current={section === 'online' ? 'page' : undefined} onClick={() => navigate('online')}><ForgeGlyph name="orbit" size={19} /> <span>Онлайн</span><span className="nav-selected-dot" /></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-quote"><div className="quote-mark"><Hammer size={30} /></div><p>ЖАР<br /><span>ПРЕВРАЩАЕТ</span><br />ЖЕЛЕЗО В СИЛУ.</p><div className="quote-line" /></div>
          <div className="sidebar-version"><span className="online-dot" /> BODYFORGE / MOBILE FIRST <span>v0.3</span></div>
        </div>
      </aside>

      <div className="main-area" id="dashboard">
        <header className="topbar">
          <div className="mobile-brand"><Brand compact /><strong>BODY<span>FORGE</span></strong></div>
          <div className="breadcrumbs"><span>КУЗНИЦА ТЕЛА</span><ChevronRight size={15} /><strong>ГЛАВНЫЙ ГОРН</strong></div>
          <div className="topbar-right">
            <AppearancePanel disabled={isCameraShown}/>
            <div className="currency-pill"><Coins size={17} /><strong>{profile.coins}</strong><span className="desktop-word">МОНЕТ</span></div>
            <div className="topbar-level"><div className="level-hex"><Zap size={17} fill="currentColor" /></div><div><small>УРОВЕНЬ ГЕРОЯ</small><strong>{String(level).padStart(2, '0')}</strong></div></div>
          </div>
        </header>

        <main className="content">
          <ResultQuarantineNotice profile={profile} count={quarantined.entries.length} unavailable={quarantined.status === 'unavailable'}/>
          {profile.game.created && (
            <section className="dashboard-player" aria-label="Прогресс бойца">
              <div className="dashboard-player-icon"><Avatar workouts={workoutCount} build={profile.game.build}
                muscles={profile.game.muscles} outfit={profile.game.outfit} look={avatarLook}/></div>
              <div className="dashboard-player-info">
                <span>ТВОЙ БОЕЦ · {getRank(workoutCount)}</span>
                <strong>{profile.game.nickname}</strong>
                <div className="dashboard-player-track" aria-label={`Прогресс до следующего уровня: ${levelPercent}%`}>
                  <div style={{ width: `${levelPercent}%` }} />
                </div>
              </div>
              <div className="dashboard-player-stats"><strong>УР. {level}</strong><span>{repetitionsDone} ПОВТОРОВ</span>
                <button type="button" className="profile-training-cta" disabled={!canNavigate}
                  onClick={() => goTraining('training', 'squat')} aria-label="Начать тренировку приседаний">
                  <Play size={13} fill="currentColor"/> СТАРТ
                </button>
              </div>
            </section>
          )}
          {!profile.game.created && <FighterSetup legacyWorkouts={profile.workouts.length}
            onCreate={(build: BodyBuild, nickname: string) => {
              setProfile((previous) => createFighter(previous, build, nickname));
              setSection('dashboard');
            }} />}
          <section className="intro" aria-label="Приветствие">
            <div className="intro-copy">
              <div className="eyebrow"><span className="tiny-spark" /> BODYFORGE / КУЗНИЦА ТЕЛА</div>
              <h1>КУЙ <em>СВОЁ</em><br /><span>ТЕЛО.</span></h1>
              <p>Реальные тренировки. Опыт, экипировка и рост твоего 3D-бойца.</p>
              <div className="intro-mark"><Hammer size={16} /><span>КАЖДОЕ ПОВТОРЕНИЕ — УДАР МОЛОТА</span></div>
            </div>
            <div className="intro-badge"><div className="intro-badge-icon"><Flame size={26} /></div><div><strong>ГОРН РАЗОГРЕТ</strong><span>ПЕРВОЕ ИСПЫТАНИЕ ГОТОВО</span></div></div>
          </section>

          <section className="cards-grid" aria-label="Герой и испытание">
            <article className="character-card">
              <div className="card-topline"><span className="section-index">01 / ТВОЯ СТАЛЬ</span><span className="tag outlined"><span className="online-dot" /> {getRank(workoutCount)}</span></div>
              <div className="character-header"><div><div className="character-subtitle">ДВИЖЕНИЕ СОЗДАЁТ ФОРМУ</div><h2>ТВОЯ <span>ЭВОЛЮЦИЯ.</span></h2></div><span className="character-level">LVL <strong>{String(level).padStart(2, '0')}</strong></span></div>
              <div className="avatar-stage">
                <div className="forge-furnace" aria-hidden="true" /><div className="arena-dashes" aria-hidden="true">BODY<span>FORGE</span></div>
                <div className="kinetic-orbit" aria-hidden="true"><i /><b /></div>
                <span className="kinetic-axis" aria-hidden="true">MOVE / BUILD / EVOLVE</span>
                <div className="stage-cross left" aria-hidden="true">+</div><div className="stage-cross right" aria-hidden="true">+</div>
                <GameAvatar workouts={workoutCount} build={profile.game.build}
                  muscles={profile.game.muscles} outfit={profile.game.outfit} paused={isCameraShown} look={avatarLook}/>
                <div className="power-label"><span className="online-dot" /><strong>МЫШЦЫ</strong><span>{Object.values(profile.game.muscles).reduce((sum, value) => sum + value, 0)}/20</span></div>
              </div>
              <div className="mobile-quickstart" aria-label="Быстрый старт тренировки">
                <div className="quickstart-copy"><span>ТВОЙ СЛЕДУЮЩИЙ УРОВЕНЬ</span><strong>20 ПРИСЕДАНИЙ</strong>
                  <small><Zap size={13}/> +{XP_REWARD} XP <Coins size={13}/> +{COIN_REWARD}</small></div>
                <button type="button" disabled={!profile.game.created || !canNavigate}
                  onClick={() => goTraining('training', 'squat')}><Play size={21} fill="currentColor"/> ТРЕНИРОВАТЬСЯ</button>
              </div>
              <div className="character-footer">
                <div className="character-detail-row"><span><Activity size={14} /> ТРЕНИРОВОК <strong>{workoutCount}</strong></span><span><Target size={14} /> ПОВТОРОВ <strong>{repetitionsDone}</strong></span></div>
                <div className="xp-heading"><span><Hammer size={16} /> ПРОЧНОСТЬ / XP</span><strong>{profile.xp % 250} <small>/ 250 XP</small></strong></div>
                <div className="xp-track"><div className="xp-progress" style={{ width: `${levelPercent}%` }} /></div>
                <div className="xp-foot"><span>УРОВЕНЬ {level}</span><span>ДО НОВОЙ ЗАКАЛКИ: {250 - (profile.xp % 250)} XP</span></div>
              </div>
            </article>

            <article className={`challenge-card${isCameraShown ? ' challenge-card-live' : ''}`} id="challenge">
              <div className="card-topline"><span className="section-index">02 / ИСПЫТАНИЕ ГОРНА</span><span className={`tag ${mode === 'active' ? 'live-tag' : 'lime-tag'}`}><span className="tag-dot" /> {mode === 'active' ? 'ИДЁТ ТРЕНИРОВКА' : mode === 'complete' ? 'ВЫПОЛНЕНО' : 'ДОСТУПНО'}</span></div>
              <div className="challenge-heading"><div><div className="challenge-type"><Hammer size={16} /> {workoutMode === 'tower' ? `БАШНЯ · ЭТАЖ ${selectedFloor.floor}` : workoutMode === 'ghost' ? 'БОЙ С ТЕНЬЮ' : exercise.focus.toUpperCase()}</div><h2>{exercise.target} <span>{exerciseTargetLabel(selectedExercise)}</span></h2><p>{exercise.coaching} Камера завершит подход после полной цели.</p></div></div>

              {showTrainingPanels && <Suspense fallback={<div role="status" className="catalog-loading">Загружаем упражнения…</div>}>
                <ExerciseCatalog selected={previewExercise} onSelect={setPreviewExercise}
                  busy={mode === 'active' || mode === 'loading'} />
              </Suspense>}

              {(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) && (
                <div className="camera-preflight" role="status">
                  <WifiOff size={19} />
                  <div><strong>КАМЕРА ТРЕБУЕТ HTTPS</strong>
                    <span>По текущему HTTP-адресу доступен интерфейс, но браузер не разрешает распознавание упражнений. Для камеры нужен защищённый HTTPS-адрес.</span>
                  </div>
                </div>
              )}

              {showTrainingPanels && <Suspense fallback={<div role="status" className="catalog-loading">Загружаем управление камерой…</div>}>
                <CameraControls source={cameraSource} verification={cameraVerification}
                  devices={cameraDevices} zoom={cameraZoom}
                  active={mode === 'active'} busy={mode === 'loading' || cameraBusy}
                  message={cameraMessage} fullFrame={showFullFrame}
                  onToggleFullFrame={() => setShowFullFrame((value) => !value)}
                  onChoose={(source) => { void chooseCamera(source); }}
                  onRefresh={() => { void refreshCameraDevices(); }}
                  onZoom={(value) => { void changeCameraZoom(value); }}/>
              </Suspense>}
              <div className="framing-primer"><Smartphone size={16}/><span>{exercise.placement[1]}</span></div>

              <div className={`training-visual${isCameraShown ? ' training-visual-camera' : ''}${mode === 'complete' ? ' training-visual-done' : ''}${showFullFrame ? ' camera-fit-whole' : ''}`} data-camera-format="9:16">
                <div className="portrait-frame-label"><span><Smartphone size={13} /> {videoOrientation === 'landscape' ? 'ШИРОКИЙ ПОТОК · РАМКА 9:16' : 'ВЕРТИКАЛЬНАЯ РАМКА / 9:16'}</span><span>{mode === 'active' ? formatTime(elapsedMs) : 'FORGE CAM · 01'}</span></div>
                <video ref={videoRef} className={`camera-feed${isCameraShown ? ' camera-visible' : ''}`} style={{ transform: cameraMirrored ? 'scaleX(-1)' : 'none' }} playsInline muted autoPlay aria-label="Видео с камеры для отслеживания упражнения" />
                <canvas ref={canvasRef} className={`pose-overlay${isCameraShown ? ' pose-visible' : ''}`} aria-hidden="true" />
                {!isCameraShown && mode !== 'complete' && <div className="scan-backdrop" aria-hidden="true"><div className="scan-corners"><ForgeGlyph name="scan" size={74} /></div><div className="scan-circle" /><div className="scan-instruction">РАЗМЕСТИ ТЕЛО В ВЕРТИКАЛЬНОМ КАДРЕ</div></div>}
                {mode === 'loading' && <div className="loading-overlay"><div className="spinner" /><strong>НАСТРАИВАЕМ КАМЕРУ</strong><span>Загружаем модуль и модель распознавания. Для первого запуска нужен интернет.</span></div>}
                {mode === 'active' && cameraBusy && <div className="camera-switch-overlay" role="status">
                  <div className="spinner"/><span>ПЕРЕКЛЮЧАЕМ ОБЪЕКТИВ</span>
                </div>}
                {mode === 'complete' ? (
                  <div className="completion-stage"><div className="completion-medal"><Trophy size={42} /></div><strong>ЗАКАЛКА ЗАВЕРШЕНА!</strong><span role="status">{isSaving ? 'СОХРАНЯЕМ РЕЗУЛЬТАТ… НЕ ЗАКРЫВАЙ СТРАНИЦУ' : exercise.unit === 'seconds' ? '30 СЕКУНД УДЕРЖАНИЯ' : '20 ЗАСЧИТАННЫХ ПОВТОРЕНИЙ'}</span><div className="completion-rewards"><div><Zap size={18} /> +{XP_REWARD} XP</div><div><Coins size={18} /> +{COIN_REWARD}</div></div></div>
                ) : (
                  <div className="counter-center"><CounterCircle count={snapshot.count} active={mode === 'active'} target={exercise.target} label={exercise.unit === 'seconds' ? 'СЕКУНД' : 'ПОВТОРЕНИЙ'} /></div>
                )}
                {mode === 'active' && (
                  <div className={`pose-hud${snapshot.angle === null ? ' pose-hud-lost' : ''}`} aria-label="Диагностика распознавания упражнения">
                    <span className="pose-hud-step">
                      {selectedExercise !== 'squat'
                        ? snapshot.phase === 'calibrate' ? 'КАЛИБРОВКА' : snapshot.phase === 'ready' ? 'ГОТОВ К ДВИЖЕНИЮ' :
                            selectedExercise === 'plank' ? 'УДЕРЖИВАЙ ПЛАНКУ' : snapshot.phase === 'descending' ? 'ДВИЖЕНИЕ' : 'ВЕРНИСЬ В НАЧАЛО'
                        : snapshot.phase === 'calibrate' ? 'КАЛИБРОВКА' :
                            snapshot.phase === 'ready' ? 'ГОТОВ К ПРИСЕДУ' : snapshot.phase === 'descending' ? 'ОПУСКАЙСЯ' : 'ВЫПРЯМИСЬ'}
                    </span>
                    <div className="pose-hud-angle"><span>{diagnostic.name}</span><strong>{snapshot.angle === null ? '—' : `${snapshot.angle}${diagnostic.unit}`}</strong></div>
                    <div className="pose-hud-target">
                      {snapshot.angle === null ? 'ПОПРАВЬ КАДР' :
                        selectedExercise !== 'squat' ? MOTION_HUD_CUES[selectedExercise].movement :
                        snapshot.depthTarget === null ? 'ВСТАНЬ ПРЯМО' :
                        snapshot.phase === 'bottom' ? `ВСТАТЬ ≥ ${snapshot.returnTarget}°` :
                          `ПРИСЕСТЬ ≤ ${snapshot.depthTarget}°`}
                    </div>
                    <div className="pose-hud-side">
                      {snapshot.angle === null
                        ? poseFound ? poseGuidance.title : 'ЧЕЛОВЕК НЕ НАЙДЕН'
                        : selectedExercise !== 'squat' && selectedExercise !== 'lunge'
                          ? MOTION_HUD_CUES[selectedExercise].focus
                          : trackingSide === 'left' ? 'ЛЕВАЯ НОГА'
                          : trackingSide === 'right' ? 'ПРАВАЯ НОГА' : 'ОБЕ НОГИ'}
                    </div>
                  </div>
                )}
                {mode === 'active' && (frameStalled || poseGuidance.warning) && (
                  <div className="pose-camera-coach" role="status" aria-live="polite" data-guidance={frameStalled ? 'camera-stalled' : poseGuidance.kind}>
                    <strong>{frameStalled ? 'КАДР КАМЕРЫ ЗАВИС' : poseGuidance.title}</strong>
                    <span>{frameStalled ? 'Новые изображения не поступают. Дождись восстановления потока или останови испытание. Это не ошибка твоей позы.' : poseGuidance.instruction}</span>
                  </div>
                )}
                {mode === 'active' && <div className="camera-corner-tag"><span className="record-dot" /> {frameStalled ? 'ПОТОК ПРИОСТАНОВЛЕН' : 'ЗАХВАТ ДВИЖЕНИЯ / LIVE'}</div>}
              </div>

              {mode === 'active' && workoutMode !== 'training' && (
                <div className="opponent-race" role="status">
                  <span>{workoutMode === 'tower' ? `БОТ «${selectedFloor.bot}»` : 'ТВОЯ ПРОШЛАЯ ТЕНЬ'}</span>
                  <strong>{opponentReps}/20</strong>
                  <span>{workoutMode === 'tower' ? `ЭТАЛОН: ${formatTime(selectedFloor.targetMs)}` :
                    `РЕКОРД: ${formatTime(profile.game.bestGhost?.durationMs ?? 0)}`}</span>
                </div>
              )}
              {mode === 'complete' && lastChallenge?.mode !== 'training' && lastChallenge && (
                <div className={`battle-result ${lastChallenge.victory ? 'victory' : 'defeat'}`}>
                  <Trophy size={23}/>
                  <div><strong>{lastChallenge.victory ? 'ПОБЕДА!' : 'ПОПРОБУЙ ЕЩЁ'}</strong>
                    <span>{isSaving ? 'Результат ожидает сохранения.' : lastChallenge.mode === 'tower'
                      ? lastChallenge.victory ? 'Этаж башни взят, награда начислена.' : 'Бот оказался быстрее. Тренировочные XP сохранены.'
                      : lastChallenge.victory ? 'Личный рекорд побит!' : 'Ты прошёл 20 повторений, но старая тень быстрее.'}</span>
                  </div>
                </div>
              )}
              <div className="live-feedback" aria-live="polite">
                {mode === 'active' ? <><span className={snapshot.angle === null ? 'feedback-dot warning' : 'feedback-dot'} /><span>{poseGuidance.warning && snapshot.angle === null ? poseGuidance.instruction : selectedExercise === 'squat' ? FEEDBACK[snapshot.feedback] : snapshot.feedback === 'great' ? 'Засчитано!' : snapshot.feedback === 'find-body' ? exercise.placement[1] : snapshot.phase === 'calibrate' ? exercise.placement[2] : snapshot.phase === 'ready' ? exercise.coaching : snapshot.phase === 'bottom' ? selectedExercise === 'plank' ? 'Держи корпус ровно' : 'Вернись в исходную позу' : 'Продолжай движение'}</span><strong>{snapshot.angle === null ? '—' : `${snapshot.angle}${diagnostic.unit}`}</strong></>
                  : mode === 'loading' ? <><div className="feedback-dot warning" /><span>Разреши доступ к камере и дождись загрузки.</span></>
                    : mode === 'complete' ? <><Check size={17} className="feedback-success" /><span>{isSaving ? 'Цель достигнута. Дождись сохранения результата.' : 'Всё засчитано. Герой стал сильнее!'}</span></>
                      : <><Smartphone size={17} /><span>{exercise.placement[1]}</span></>}
              </div>
              {mode === 'active' && videoOrientation === 'landscape' && <div className="portrait-notice"><Info size={16} /><span>{showFullFrame ? 'Камера отдаёт широкий поток без обрезки. ' + exercise.placement[1] : 'Широкий поток показан по центру; включи «Показать весь кадр», чтобы видеть края.'}</span></div>}
              {mode === 'active' && videoOrientation === 'portrait' &&
                exerciseCameraLayout(selectedExercise) === 'landscape' &&
                <div className="portrait-notice" role="status"><Info size={16}/><span>Для этого упражнения камера не предоставила широкий поток. Поверни телефон горизонтально или отойди дальше: руки, таз и стопы должны быть видны целиком.</span></div>}
              <div className="challenge-stats"><div><span>ВРЕМЯ</span><strong><Clock3 size={16} /> {formatTime(displayTime)}</strong></div><span className="stats-separator" /><div><span>НАГРАДА</span><strong className="reward-color"><Zap size={15} /> +{XP_REWARD} XP</strong></div><span className="stats-separator" /><div><span>МОНЕТЫ</span><strong className="reward-color"><Coins size={15} /> +{COIN_REWARD}</strong></div></div>

              <div className="training-settings">
                <button type="button" className="sound-toggle" aria-pressed={soundEnabled}
                  disabled={mode === 'active' || mode === 'loading'} onClick={() => setSoundEnabled((enabled) => !enabled)}>
                  {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
                  <span>ЗВУК ПОВТОРЕНИЙ</span>
                  <strong>{soundEnabled ? 'ВКЛ' : 'ВЫКЛ'}</strong>
                </button>
                <span>Короткий сигнал молота после каждого зачёта</span>
              </div>

              {mode === 'error' && <div className="camera-error" role="alert"><WifiOff size={18} /><span>{error}</span></div>}
              {mode === 'idle' && (canStartCameraExercise(previewExercise)
                ? <button className="primary-button" onClick={() => goTraining('training')}><Hammer size={20} /> НАЧАТЬ ЗАКАЛКУ <ArrowRight size={20} /></button>
                : <button className="primary-button" onClick={() => setPreviewExercise('squat')}><CameraOff size={20} /> ВЕРНУТЬСЯ К ПРИСЕДАНИЯМ <ArrowRight size={20} /></button>)}
              {mode === 'loading' && <button className="secondary-button" onClick={cancel}><X size={18} /> ОТМЕНИТЬ ЗАПУСК</button>}
              {mode === 'active' && <button className="secondary-button" onClick={cancel}><CameraOff size={18} /> ЗАВЕРШИТЬ БЕЗ НАГРАДЫ</button>}
              {mode === 'error' && (profile.game.created
                ? cameraModuleUnavailable
                  ? <button className="primary-button" onClick={() => window.location.reload()}><RotateCcw size={19} /> ОБНОВИТЬ ПРИЛОЖЕНИЕ <ArrowRight size={19} /></button>
                  : <button className="primary-button" onClick={() => goTraining(workoutMode)}><RotateCcw size={19} /> ПОВТОРИТЬ ПОПЫТКУ <ArrowRight size={19} /></button>
                : <button className="primary-button" onClick={() => { setMode('idle'); navigate('dashboard'); }}><UserRound size={19} /> СОЗДАТЬ БОЙЦА <ArrowRight size={19} /></button>
              )}
              {mode === 'complete' && <button className="primary-button" onClick={() => goTraining(workoutMode)}><RotateCcw size={19} /> НОВАЯ ЗАКАЛКА <ArrowRight size={19} /></button>}
              <div className="challenge-footnote"><ShieldCheck size={14} /> ВИДЕО ОБРАБАТЫВАЕТСЯ НА ТВОЁМ УСТРОЙСТВЕ · НЕ ЗАПИСЫВАЕТСЯ</div>
              {showTrainingPanels && <Suspense fallback={<div role="status" className="catalog-loading">Загружаем диагностику…</div>}>
                <RuntimeDiagnosticsPanel />
              </Suspense>}
            </article>
          </section>

          {profile.game.created && <Suspense fallback={<div className="pulse-lazy-placeholder" role="status">Загружаем сохранённую статистику…</div>}>
            <ProgressPulseBoard profile={profile} now={today} onTraining={() => goTraining('training', 'squat')}
              onAvatar={() => navigate('forge')}/>
          </Suspense>}
          {profile.game.created && <ForgeQuickDeck profile={profile} disabled={!canNavigate}
            onTraining={() => goTraining('training', 'squat')} onAvatar={() => navigate('forge')}
            onTower={() => navigate('tower')}
            onDaily={() => document.getElementById('daily-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}/>}
          {profile.game.created && <DailyPlanBoard profile={profile} now={today} onTraining={() => goTraining('training', 'squat')}/>}
          <DailyBoard profile={profile} now={today} busy={isSaving}
            onLogin={() => {
              const now = new Date();
              setToday(now);
              setProfile((previous) => claimLogin(previous, now));
            }}
            onClaimQuest={() => {
              const now = new Date();
              setToday(now);
              setProfile((previous) => claimDailyQuest(previous, now));
            }}
            onTraining={() => goTraining('training', 'squat')}/>
          {profile.game.created && <Suspense fallback={<div className="pulse-lazy-placeholder" role="status">Загружаем шаги за день…</div>}>
            <StepsBoard now={today}/>
          </Suspense>}
          <ForgeStudio profile={profile} paused={isCameraShown} busy={isSaving} active={section === 'forge'}
            look={avatarLook} onLookChange={updateAvatarLook} lookStatus={avatarLookStatus} lookMessage={avatarLookMessage}
            onUpgrade={(part: Muscle) => setProfile((previous) => upgradeMuscle(previous, part))}
            onOutfit={(outfit: Outfit) => setProfile((previous) => buyOrEquipOutfit(previous, outfit))}/>
          <TowerBoard profile={profile}
            onTower={() => goTraining('tower')}
            onGhost={() => goTraining('ghost')}/>
          <OnlineBoard/>

          <section className="lower-grid" id="progress" aria-label="Прогресс тренировок">
            <div className="records-card">
              <div className="lower-card-header"><div><span className="section-index">03 / ЛЕТОПИСЬ КУЗНИ</span><h3>СЛЕДЫ <em>ТВОЕЙ СИЛЫ</em></h3></div><Award size={22} /></div>
              <div className="record-list">
                <div className="record-item"><div className="record-icon"><Dumbbell size={22} /></div><div><strong>{repetitionsDone}</strong><span>ВСЕГО ПОВТОРЕНИЙ</span></div></div>
                <div className="record-item"><div className="record-icon"><Medal size={22} /></div><div><strong>{workoutCount}</strong><span>ИСПЫТАНИЙ ПРОЙДЕНО</span></div></div>
                <div className="record-item"><div className="record-icon"><Clock3 size={22} /></div><div><strong className="time-record">{best === null ? '— : —' : formatTime(best)}</strong><span>ЛУЧШЕЕ ВРЕМЯ</span></div></div>
              </div>
              <div className="recent-history"><strong>ПОСЛЕДНИЕ ТРЕНИРОВКИ</strong>{profile.workouts.length === 0 ? <span>Пока пусто. Пройди первое испытание!</span> : <ul>{profile.workouts.slice(0, 3).map((workout) => <li key={workout.id}><Check size={14} /><span>{new Date(workout.finishedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}</span><span>{workout.exerciseId === 'plank' ? '30 сек. планки' : `${workout.repetitions} · ${exerciseGuide(workout.exerciseId ?? 'squat').name.toLowerCase()}`}</span><strong>{formatTime(workout.durationMs)}</strong></li>)}</ul>}</div>
            </div>
            <div className="tips-card"><div className="lower-card-header"><div><span className="section-index">ПЕРЕД УДАРОМ</span><h3>ПОДГОТОВЬ <em>КАДР</em></h3></div><CircleHelp size={22} /></div>
              <div className="tip-row"><div className="tip-number">01</div><div><strong>Телефон вертикально, сбоку</strong><span>Снимай в портретном положении 9:16. Целиком должны быть видны таз, колени и стопы.</span></div></div>
              <div className="tip-row"><div className="tip-number">02</div><div><strong>Прими исходную стойку</strong><span>Система сначала определит исходную стойку, затем включит секундомер.</span></div></div>
              <div className="tip-row"><div className="tip-number">03</div><div><strong>Выполни 20 полных приседаний</strong><span>Присядь достаточно глубоко и выпрями ноги. На двадцатом система остановится сама.</span></div></div>
              <div className="tips-note"><Info size={16} /><span>Подсчёт — экспериментальная функция. Он не заменяет тренера и не гарантирует оценку техники.</span></div>
            </div>
          </section>
          {profile.game.created && section === 'dashboard' && <Suspense fallback={null}>
            <ProgressBackupPanel profile={profile} pendingResult={pendingResult}
              disabled={isSaving || !canNavigate}/>
          </Suspense>}
          <footer className="footer"><span><span className="footer-mark"><BrandMark size={18} /></span> BODYFORGE · КУЗНИЦА ТЕЛА</span><span>ДВИЖЕНИЕ СОЗДАЁТ ФОРМУ.</span></footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        <button type="button" disabled={!canNavigate} aria-current={section === 'dashboard' ? 'page' : undefined} onClick={() => navigate('dashboard')} className={section === 'dashboard' ? 'active' : ''}><ForgeGlyph name="home" size={21}/><span>ГОРН</span></button>
        <button type="button" aria-current={section === 'challenge' ? 'page' : undefined} onClick={() => navigate('challenge')} className={section === 'challenge' ? 'active' : ''}><ForgeGlyph name="scan" size={21}/><span>КАМЕРА</span></button>
        <button type="button" disabled={!canNavigate} aria-current={section === 'forge' ? 'page' : undefined} onClick={() => navigate('forge')} className={section === 'forge' ? 'active' : ''}><ForgeGlyph name="body" size={21}/><span>ГЕРОЙ</span></button>
        <button type="button" disabled={!canNavigate} aria-current={section === 'tower' ? 'page' : undefined} onClick={() => navigate('tower')} className={section === 'tower' ? 'active' : ''}><ForgeGlyph name="tower" size={21}/><span>БАШНЯ</span></button>
        <button type="button" disabled={!canNavigate} aria-current={section === 'online' ? 'page' : undefined} onClick={() => navigate('online')} className={section === 'online' ? 'active' : ''}><ForgeGlyph name="orbit" size={21}/><span>ОНЛАЙН</span></button>
      </nav>
      <div className="screen-grain" aria-hidden="true" />
      <div className="sr-only" aria-live="polite">{mode === 'complete' ? isSaving
        ? 'Тренировка окончена. Результат ожидает сохранения.' : 'Тренировка окончена. Вы получили опыт и монеты.' : ''}</div>
    </div>
  );
}

export default App;
