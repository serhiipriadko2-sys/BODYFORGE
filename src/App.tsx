import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowRight, Award, CameraOff, Check, ChevronRight,
  CircleHelp, Clock3, Coins, Dumbbell, Flame, Info,
  Hammer, Medal, Play, RotateCcw, ShieldCheck, Smartphone, Target,
  Trophy, Volume2, VolumeX, WifiOff, X, Zap, Swords, Globe2, UserRound,
} from 'lucide-react';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import GameAvatar from './components/GameAvatar';
import CameraControls from './components/CameraControls';
import RuntimeDiagnosticsPanel from './components/RuntimeDiagnosticsPanel';
import { runtimeDiagnostics } from './lib/runtimeDiagnostics';
import StorageRecovery from './components/StorageRecovery';
import './recovery.css';
import { useProfileStorage } from './hooks/useProfileStorage';
import { withTimeout } from './lib/withTimeout';
import { DailyBoard, FighterSetup, ForgeStudio, OnlineBoard, TowerBoard } from './components/ForgeWorld';
import {
  buyOrEquipOutfit, claimDailyQuest, claimLogin, createFighter, ghostRepetitions,
  nextTowerFloor, TOWER_FLOORS, upgradeMuscle,
  type BodyBuild, type Muscle, type Outfit, type WorkoutMode,
} from './lib/game';
import {
  getProfileTotals, COIN_REWARD, formatTime, getLevel,
  getLevelProgress, getRank, TARGET_REPS, XP_REWARD,
} from './lib/progression';
import type { WorkoutSession } from './lib/workoutJournal';
import { SquatCounter, StableKneeTracker, type CounterFeedback, type CounterSnapshot, type PosePoint } from './lib/squatCounter';
import {
  cameraDeviceOptions, cameraOrientation, cameraZoomCapabilities, portraitCameraConstraints,
  zoomConstraints, DEFAULT_CAMERA, VideoFrameGate, CameraFrameWatchdog,
  type CameraDeviceOption, type CameraOrientation, type CameraSource, type CameraZoom,
} from './lib/camera';
import { PoseGuidanceTracker, type PoseGuidance } from './lib/poseGuidance';

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
  const segments = [[11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
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
  for (const index of [11, 12, 23, 24, 25, 26, 27, 28]) {
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
      <div className="brand-symbol"><Hammer size={26} strokeWidth={2.8} /><i /></div>
      {!compact && <div className="brand-copy"><strong>BODY<span>FORGE</span></strong><small>КУЗНИЦА ТЕЛА / EST. 2026</small></div>}
    </div>
  );
}

function CounterCircle({ count, active }: { count: number; active: boolean }) {
  const progress = Math.min(1, count / TARGET_REPS);
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
      <div className="counter-inner"><span className="counter-number">{count}</span><span className="counter-divider" /><span className="counter-target">/ {TARGET_REPS}</span><small>ПРИСЕДАНИЙ</small></div>
    </div>
  );
}

function App() {
  const { profile, setProfile, status: storageStatus, backupAvailable, writeIssue, isSaving, pendingResult, journalEntries,
    beginWorkout, completeWorkout, openCurrent, retry: retryStorage, recover: recoverStorage, reload: reloadStorage } = useProfileStorage();
  const [mode, setMode] = useState<Mode>('idle');
  const [snapshot, setSnapshot] = useState<CounterSnapshot>(FIRST_SNAPSHOT);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState('');
  const [lastResultMs, setLastResultMs] = useState<number | null>(null);
  const [section, setSection] = useState('dashboard');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [videoOrientation, setVideoOrientation] = useState<CameraOrientation>('unknown');
  const [cameraSource, setCameraSource] = useState<CameraSource>(DEFAULT_CAMERA);
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceOption[]>([]);
  const [cameraZoom, setCameraZoom] = useState<CameraZoom | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraMirrored, setCameraMirrored] = useState(true);
  const [frameStalled, setFrameStalled] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [cameraModuleUnavailable, setCameraModuleUnavailable] = useState(false);
  const [showFullFrame, setShowFullFrame] = useState(false);
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>('training');
  const [lastChallenge, setLastChallenge] = useState<{ mode: WorkoutMode; victory: boolean | null } | null>(null);
  const [today, setToday] = useState(() => new Date());
  // A daily reward must unlock after local midnight even if the app stays open.
  useEffect(() => {
    const refresh = () => {
      const now = new Date();
      setToday((previous) => previous.toDateString() === now.toDateString() ? previous : now);
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
  const workoutModeRef = useRef<WorkoutMode>('training');
  const splitsRef = useRef<number[]>([]);
  const kneeTrackerRef = useRef(new StableKneeTracker());
  const poseGuidanceRef = useRef(new PoseGuidanceTracker());
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
    setPoseGuidance(poseGuidanceRef.current.reset());
    setTrackingSide(null);
    setPoseFound(false);
    setSnapshot(counterRef.current.recalibrate());
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
    const stream = await withTimeout(navigator.mediaDevices.getUserMedia(portraitCameraConstraints(source)), 20000, 'Camera permission timeout',
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
        const facing = track.getSettings().facingMode;
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
          setCameraMessage('Кадры снова поступают. Встань прямо для повторной калибровки.');
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
    kneeTrackerRef.current.reset();
    setPoseGuidance(poseGuidanceRef.current.reset());
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

  const start = useCallback(async (requestedMode: WorkoutMode = 'training') => {
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
    splitsRef.current = [];
    setLastChallenge(null);
    stopCapture();
    counterRef.current.reset();
    kneeTrackerRef.current.reset();
    setPoseGuidance(poseGuidanceRef.current.reset());
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
      const session = await beginWorkout(requestedMode);
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
            setCameraMessage('Кадры снова поступают. Встань прямо для повторной калибровки.');
          }
          stallReportedRef.current = false;
          try {
            const inferenceStarted = performance.now();
            const result = landmarkerRef.current.detectForVideo(liveVideo, time);
            runtimeDiagnostics.recordInference(performance.now() - inferenceStarted, time);
            const points = result.landmarks[0] as PosePoint[] | undefined;
            drawSkeleton(canvasRef.current, liveVideo, points, mirroredRef.current);
            const measured = kneeTrackerRef.current.update(points ?? [], liveVideo.videoWidth / liveVideo.videoHeight);
            setPoseGuidance(poseGuidanceRef.current.update(points, measured.angle, time));
            setPoseFound(Boolean(points?.length));
            setTrackingSide(measured.side);
            const next = counterRef.current.update(measured.angle, time, measured.side);
            setSnapshot(next);
            if (next.counted) {
              if (startedAtRef.current !== null) splitsRef.current.push(Math.max(0, time - startedAtRef.current));
              if (soundEnabled) playRepCue(audioRef.current, next.count >= TARGET_REPS);
            }
            if (next.calibrated && startedAtRef.current === null) startedAtRef.current = time;
            if (next.count >= TARGET_REPS) {
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
              // Freeze once outside React's updater (which StrictMode may invoke twice).
              const finishedAt = new Date();
              const result = { ...session, durationMs, finishedAt: finishedAt.toISOString(), repetitions: 20 as const,
                splitsMs: [...splitsRef.current] };
              setToday(new Date());
              stopCapture();
              setMode('complete');
              void completeWorkout(result);
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
          setSnapshot(counterRef.current.recalibrate());
          setPoseGuidance(poseGuidanceRef.current.reset());
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
  }, [stopCapture, soundEnabled, profile.game, connectCamera, cameraSource, interruptCapture, storageStatus, isSaving, mode, beginWorkout, completeWorkout]);

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
      setCameraMessage('Масштаб изменён. Встань прямо: повторная калибровка без потери приседаний.');
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
      await connectCamera(nextSource, requestId);
      if (requestId !== requestIdRef.current) return;
      resume(nextSource);
      if (nextSource.kind === 'device' &&
          cameraDevices.some((device) => device.deviceId === nextSource.value && device.ultraWide)) {
        setShowFullFrame(true);
      }
      setCameraMessage('Запросили выбранный объектив. Проверь обзор и встань прямо для калибровки; счётчик сохранён.');
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

  function goTraining(requestedMode: WorkoutMode = 'training') {
    navigate('challenge');
    void start(requestedMode);
  }

  const selectedFloor = nextTowerFloor(profile.game);
  const opponentReps = mode === 'active' && workoutMode === 'tower'
    ? Math.min(TARGET_REPS, Math.floor(elapsedMs / (selectedFloor.targetMs / TARGET_REPS)))
    : mode === 'active' && workoutMode === 'ghost' && profile.game.bestGhost
      ? ghostRepetitions(profile.game.bestGhost.splitsMs, elapsedMs) : 0;
  const canNavigate = mode !== 'active' && mode !== 'loading';

  if (storageStatus !== 'ready') return <StorageRecovery status={storageStatus} backupAvailable={backupAvailable}
    writeIssue={writeIssue} isSaving={isSaving} profile={profile} pendingResult={pendingResult} journalEntries={journalEntries}
    onOpenCurrent={openCurrent} onRetry={retryStorage} onRecover={recoverStorage} onReload={reloadStorage}/>;

  return (
    <div className="app-shell" data-screen={section} data-fighter-created={profile.game.created ? 'true' : 'false'}>
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-section-label">НАВИГАЦИЯ КУЗНИ</div>
        <nav className="nav-items" aria-label="Навигация">
          <button disabled={!canNavigate} className={`nav-item${section === 'dashboard' ? ' selected' : ''}`} onClick={() => navigate('dashboard')}><Activity size={19} /> <span>Горн</span><span className="nav-selected-dot" /></button>
          <button className={`nav-item${section === 'challenge' ? ' selected' : ''}`} onClick={() => navigate('challenge')}><Target size={19} /> <span>Тренировка</span><span className="nav-selected-dot" /></button>
          <button disabled={!canNavigate} className={`nav-item${section === 'forge' ? ' selected' : ''}`} onClick={() => navigate('forge')}><UserRound size={19} /> <span>Персонаж</span><span className="nav-selected-dot" /></button>
          <button disabled={!canNavigate} className={`nav-item${section === 'tower' ? ' selected' : ''}`} onClick={() => navigate('tower')}><Swords size={19} /> <span>Башня</span><span className="nav-selected-dot" /></button>
          <button disabled={!canNavigate} className={`nav-item${section === 'online' ? ' selected' : ''}`} onClick={() => navigate('online')}><Globe2 size={19} /> <span>Онлайн</span><span className="nav-selected-dot" /></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-quote"><div className="quote-mark"><Hammer size={30} /></div><p>ЖАР<br /><span>ПРЕВРАЩАЕТ</span><br />ЖЕЛЕЗО В СИЛУ.</p><div className="quote-line" /></div>
          <div className="sidebar-version"><span className="online-dot" /> BODYFORGE / MOBILE FIRST <span>v0.3</span></div>
        </div>
      </aside>

      <div className="main-area" id="dashboard">
        <header className="topbar">
          <div className="mobile-brand"><Brand compact /><strong>BODYFORGE</strong></div>
          <div className="breadcrumbs"><span>КУЗНИЦА ТЕЛА</span><ChevronRight size={15} /><strong>ГЛАВНЫЙ ГОРН</strong></div>
          <div className="topbar-right">
            <div className="currency-pill"><Coins size={17} /><strong>{profile.coins}</strong><span className="desktop-word">МОНЕТ</span></div>
            <div className="topbar-level"><div className="level-hex"><Zap size={17} fill="currentColor" /></div><div><small>УРОВЕНЬ ГЕРОЯ</small><strong>{String(level).padStart(2, '0')}</strong></div></div>
          </div>
        </header>

        <main className="content">
          {profile.game.created && (
            <section className="dashboard-player" aria-label="Прогресс бойца">
              <div className="dashboard-player-icon"><UserRound size={23} /></div>
              <div className="dashboard-player-info">
                <span>ТВОЙ БОЕЦ · {getRank(workoutCount)}</span>
                <strong>{profile.game.nickname}</strong>
                <div className="dashboard-player-track" aria-label={`Прогресс до следующего уровня: ${levelPercent}%`}>
                  <div style={{ width: `${levelPercent}%` }} />
                </div>
              </div>
              <div className="dashboard-player-stats"><strong>УР. {level}</strong><span>{repetitionsDone} ПОВТОРОВ</span></div>
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
              <p>Ты не просто тренируешься — ты выковываешь нового себя. Каждое движение закаляет тело и делает твоего бойца сильнее.</p>
              <div className="intro-mark"><Hammer size={16} /><span>КАЖДОЕ ПОВТОРЕНИЕ — УДАР МОЛОТА</span></div>
            </div>
            <div className="intro-badge"><div className="intro-badge-icon"><Flame size={26} /></div><div><strong>ГОРН РАЗОГРЕТ</strong><span>ПЕРВОЕ ИСПЫТАНИЕ ГОТОВО</span></div></div>
          </section>

          <section className="cards-grid" aria-label="Герой и испытание">
            <article className="character-card">
              <div className="card-topline"><span className="section-index">01 / ТВОЯ СТАЛЬ</span><span className="tag outlined"><span className="online-dot" /> {getRank(workoutCount)}</span></div>
              <div className="character-header"><div><div className="character-subtitle">{profile.game.created ? profile.game.nickname : 'ВЫКОВАНО ТВОИМИ УСИЛИЯМИ'}</div><h2>СТАЛЬНОЙ <span>БОЕЦ</span></h2></div><span className="character-level">LVL <strong>{String(level).padStart(2, '0')}</strong></span></div>
              <div className="avatar-stage">
                <div className="forge-furnace" aria-hidden="true" /><div className="arena-dashes" aria-hidden="true">BODY<span>FORGE</span></div>
                <div className="stage-cross left" aria-hidden="true">+</div><div className="stage-cross right" aria-hidden="true">+</div>
                <GameAvatar workouts={workoutCount} build={profile.game.build}
                  muscles={profile.game.muscles} outfit={profile.game.outfit} paused={isCameraShown}/>
                <div className="power-label"><span className="online-dot" /><strong>МЫШЦЫ</strong><span>{Object.values(profile.game.muscles).reduce((sum, value) => sum + value, 0)}/20</span></div>
              </div>
              <div className="mobile-quickstart" aria-label="Быстрый старт тренировки">
                <div className="quickstart-copy"><span>ТВОЙ СЕГОДНЯШНИЙ ШАГ</span><strong>20 ПРИСЕДАНИЙ</strong>
                  <small><Zap size={13}/> +{XP_REWARD} XP <Coins size={13}/> +{COIN_REWARD}</small></div>
                <button type="button" disabled={!profile.game.created || !canNavigate}
                  onClick={() => goTraining('training')}><Play size={21} fill="currentColor"/> ТРЕНИРОВАТЬСЯ</button>
              </div>
              <div className="character-footer">
                <div className="character-detail-row"><span><Activity size={14} /> ТРЕНИРОВОК <strong>{workoutCount}</strong></span><span><Target size={14} /> ПРИСЕДАНИЙ <strong>{repetitionsDone}</strong></span></div>
                <div className="xp-heading"><span><Hammer size={16} /> ПРОЧНОСТЬ / XP</span><strong>{profile.xp % 250} <small>/ 250 XP</small></strong></div>
                <div className="xp-track"><div className="xp-progress" style={{ width: `${levelPercent}%` }} /></div>
                <div className="xp-foot"><span>УРОВЕНЬ {level}</span><span>ДО НОВОЙ ЗАКАЛКИ: {250 - (profile.xp % 250)} XP</span></div>
              </div>
            </article>

            <article className={`challenge-card${isCameraShown ? ' challenge-card-live' : ''}`} id="challenge">
              <div className="card-topline"><span className="section-index">02 / ИСПЫТАНИЕ ГОРНА</span><span className={`tag ${mode === 'active' ? 'live-tag' : 'lime-tag'}`}><span className="tag-dot" /> {mode === 'active' ? 'ИДЁТ ТРЕНИРОВКА' : mode === 'complete' ? 'ВЫПОЛНЕНО' : 'ДОСТУПНО'}</span></div>
              <div className="challenge-heading"><div><div className="challenge-type"><Hammer size={16} /> {workoutMode === 'tower' ? `БАШНЯ · ЭТАЖ ${selectedFloor.floor}` : workoutMode === 'ghost' ? 'БОЙ С ТЕНЬЮ' : 'ЗАКАЛКА №01 / СИЛА НОГ'}</div><h2>20 <span>ПРИСЕДАНИЙ</span></h2><p>Двадцать ударов по своей слабости. Камера следит за каждым полным движением и останавливает испытание автоматически.</p></div></div>

              {(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) && (
                <div className="camera-preflight" role="status">
                  <WifiOff size={19} />
                  <div><strong>КАМЕРА ТРЕБУЕТ HTTPS</strong>
                    <span>По текущему HTTP-адресу доступен интерфейс, но браузер не разрешает распознавание приседаний. Для камеры нужен защищённый HTTPS-адрес.</span>
                  </div>
                </div>
              )}

              <CameraControls source={cameraSource} devices={cameraDevices} zoom={cameraZoom}
                active={mode === 'active'} busy={mode === 'loading' || cameraBusy}
                message={cameraMessage} fullFrame={showFullFrame}
                onToggleFullFrame={() => setShowFullFrame((value) => !value)}
                onChoose={(source) => { void chooseCamera(source); }}
                onRefresh={() => { void refreshCameraDevices(); }}
                onZoom={(value) => { void changeCameraZoom(value); }}/>
              <div className="framing-primer"><Smartphone size={16}/><span>Для приседаний установи телефон <strong>сбоку</strong> и дальше от себя. В кадре должны быть таз, колено и стопа хотя бы одной ноги.</span></div>

              <div className={`training-visual${isCameraShown ? ' training-visual-camera' : ''}${mode === 'complete' ? ' training-visual-done' : ''}${showFullFrame ? ' camera-fit-whole' : ''}`} data-camera-format="9:16">
                <div className="portrait-frame-label"><span><Smartphone size={13} /> ВЕРТИКАЛЬНЫЙ КАДР / 9:16</span><span>{mode === 'active' ? formatTime(elapsedMs) : 'FORGE CAM · 01'}</span></div>
                <video ref={videoRef} className={`camera-feed${isCameraShown ? ' camera-visible' : ''}`} style={{ transform: cameraMirrored ? 'scaleX(-1)' : 'none' }} playsInline muted autoPlay aria-label="Вертикальное окно видеозахвата для отслеживания приседаний" />
                <canvas ref={canvasRef} className={`pose-overlay${isCameraShown ? ' pose-visible' : ''}`} aria-hidden="true" />
                {!isCameraShown && mode !== 'complete' && <div className="scan-backdrop" aria-hidden="true"><div className="scan-corners"><Hammer size={74} strokeWidth={1.1} /></div><div className="scan-circle" /><div className="scan-instruction">РАЗМЕСТИ ТЕЛО В ВЕРТИКАЛЬНОМ КАДРЕ</div></div>}
                {mode === 'loading' && <div className="loading-overlay"><div className="spinner" /><strong>НАСТРАИВАЕМ КАМЕРУ</strong><span>Загружаем модуль и модель распознавания. Для первого запуска нужен интернет.</span></div>}
                {mode === 'active' && cameraBusy && <div className="camera-switch-overlay" role="status">
                  <div className="spinner"/><span>ПЕРЕКЛЮЧАЕМ ОБЪЕКТИВ</span>
                </div>}
                {mode === 'complete' ? (
                  <div className="completion-stage"><div className="completion-medal"><Trophy size={42} /></div><strong>ЗАКАЛКА ЗАВЕРШЕНА!</strong><span role="status">{isSaving ? 'СОХРАНЯЕМ РЕЗУЛЬТАТ… НЕ ЗАКРЫВАЙ СТРАНИЦУ' : '20 ЗАСЧИТАННЫХ ПОВТОРЕНИЙ'}</span><div className="completion-rewards"><div><Zap size={18} /> +{XP_REWARD} XP</div><div><Coins size={18} /> +{COIN_REWARD}</div></div></div>
                ) : (
                  <div className="counter-center"><CounterCircle count={snapshot.count} active={mode === 'active'} /></div>
                )}
                {mode === 'active' && (
                  <div className={`pose-hud${snapshot.angle === null ? ' pose-hud-lost' : ''}`} aria-label="Диагностика распознавания приседаний">
                    <span className="pose-hud-step">
                      {snapshot.phase === 'calibrate' ? 'КАЛИБРОВКА' :
                        snapshot.phase === 'ready' ? 'ГОТОВ К ПРИСЕДУ' :
                          snapshot.phase === 'descending' ? 'ОПУСКАЙСЯ' : 'ВЫПРЯМИСЬ'}
                    </span>
                    <div className="pose-hud-angle"><span>КОЛЕНО</span><strong>{snapshot.angle === null ? '—' : `${snapshot.angle}°`}</strong></div>
                    <div className="pose-hud-target">
                      {snapshot.angle === null ? 'ПОПРАВЬ КАДР' :
                        snapshot.depthTarget === null ? 'ВСТАНЬ ПРЯМО' :
                        snapshot.phase === 'bottom' ? `ВСТАТЬ ≥ ${snapshot.returnTarget}°` :
                          `ПРИСЕСТЬ ≤ ${snapshot.depthTarget}°`}
                    </div>
                    <div className="pose-hud-side">
                      {snapshot.angle === null
                        ? poseFound ? poseGuidance.title : 'ЧЕЛОВЕК НЕ НАЙДЕН'
                        : trackingSide === 'left' ? 'ЛЕВАЯ НОГА' : 'ПРАВАЯ НОГА'}
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
                {mode === 'active' ? <><span className={snapshot.angle === null ? 'feedback-dot warning' : 'feedback-dot'} /><span>{poseGuidance.warning && snapshot.angle === null ? poseGuidance.instruction : FEEDBACK[snapshot.feedback]}</span><strong>{snapshot.angle === null ? '—' : `${snapshot.angle}°`}</strong></>
                  : mode === 'loading' ? <><div className="feedback-dot warning" /><span>Разреши доступ к камере и дождись загрузки.</span></>
                    : mode === 'complete' ? <><Check size={17} className="feedback-success" /><span>{isSaving ? '20 повторов засчитаны. Дождись сохранения результата.' : 'Всё засчитано. Герой стал сильнее!'}</span></>
                      : <><Smartphone size={17} /><span>Поставь телефон вертикально, сбоку от себя. Тело и стопы должны быть видны.</span></>}
              </div>
              {mode === 'active' && videoOrientation === 'landscape' && <div className="portrait-notice"><Info size={16} /><span>Камера отдаёт широкий поток. Показываем его центр в вертикальной рамке — стой посередине.</span></div>}
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
              {mode === 'idle' && <button className="primary-button" onClick={() => goTraining('training')}><Hammer size={20} /> НАЧАТЬ ЗАКАЛКУ <ArrowRight size={20} /></button>}
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
              <RuntimeDiagnosticsPanel />
            </article>
          </section>

          <DailyBoard profile={profile} now={today}
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
            onTraining={() => goTraining('training')}/>
          <ForgeStudio profile={profile} paused={isCameraShown}
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
                <div className="record-item"><div className="record-icon"><Dumbbell size={22} /></div><div><strong>{repetitionsDone}</strong><span>ВСЕГО ПРИСЕДАНИЙ</span></div></div>
                <div className="record-item"><div className="record-icon"><Medal size={22} /></div><div><strong>{workoutCount}</strong><span>ИСПЫТАНИЙ ПРОЙДЕНО</span></div></div>
                <div className="record-item"><div className="record-icon"><Clock3 size={22} /></div><div><strong className="time-record">{best === null ? '— : —' : formatTime(best)}</strong><span>ЛУЧШЕЕ ВРЕМЯ</span></div></div>
              </div>
              <div className="recent-history"><strong>ПОСЛЕДНИЕ ТРЕНИРОВКИ</strong>{profile.workouts.length === 0 ? <span>Пока пусто. Пройди первое испытание!</span> : <ul>{profile.workouts.slice(0, 3).map((workout) => <li key={workout.id}><Check size={14} /><span>{new Date(workout.finishedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}</span><span>{TARGET_REPS} приседаний</span><strong>{formatTime(workout.durationMs)}</strong></li>)}</ul>}</div>
            </div>
            <div className="tips-card"><div className="lower-card-header"><div><span className="section-index">ПЕРЕД УДАРОМ</span><h3>ПОДГОТОВЬ <em>КАДР</em></h3></div><CircleHelp size={22} /></div>
              <div className="tip-row"><div className="tip-number">01</div><div><strong>Телефон вертикально, сбоку</strong><span>Снимай в портретном положении 9:16. Целиком должны быть видны таз, колени и стопы.</span></div></div>
              <div className="tip-row"><div className="tip-number">02</div><div><strong>Прими исходную стойку</strong><span>Система сначала определит исходную стойку, затем включит секундомер.</span></div></div>
              <div className="tip-row"><div className="tip-number">03</div><div><strong>Выполни 20 полных приседаний</strong><span>Присядь достаточно глубоко и выпрями ноги. На двадцатом система остановится сама.</span></div></div>
              <div className="tips-note"><Info size={16} /><span>Подсчёт — экспериментальная функция. Он не заменяет тренера и не гарантирует оценку техники.</span></div>
            </div>
          </section>
          <footer className="footer"><span><span className="footer-mark"><Hammer size={13} /></span> BODYFORGE · КУЗНИЦА ТЕЛА</span><span>СТАЛЬ НЕ РОЖДАЕТСЯ ГОТОВОЙ.</span></footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        <button type="button" disabled={!canNavigate} onClick={() => navigate('dashboard')} className={section === 'dashboard' ? 'active' : ''}><Activity size={21}/><span>ГОРН</span></button>
        <button type="button" onClick={() => navigate('challenge')} className={section === 'challenge' ? 'active' : ''}><Play size={21}/><span>КАМЕРА</span></button>
        <button type="button" disabled={!canNavigate} onClick={() => navigate('forge')} className={section === 'forge' ? 'active' : ''}><UserRound size={21}/><span>ГЕРОЙ</span></button>
        <button type="button" disabled={!canNavigate} onClick={() => navigate('tower')} className={section === 'tower' ? 'active' : ''}><Swords size={21}/><span>БАШНЯ</span></button>
        <button type="button" disabled={!canNavigate} onClick={() => navigate('online')} className={section === 'online' ? 'active' : ''}><Globe2 size={21}/><span>ОНЛАЙН</span></button>
      </nav>
      <div className="screen-grain" aria-hidden="true" />
      <div className="sr-only" aria-live="polite">{mode === 'complete' ? isSaving
        ? 'Тренировка окончена. Результат ожидает сохранения.' : 'Тренировка окончена. Вы получили опыт и монеты.' : ''}</div>
    </div>
  );
}

export default App;
