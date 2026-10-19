import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowRight, Award, CameraOff, Check, ChevronRight,
  CircleHelp, Clock3, Coins, Dumbbell, Flame, Info,
  Hammer, Medal, Play, RotateCcw, ShieldCheck, Smartphone, Target,
  TrendingUp, Trophy, Volume2, VolumeX, WifiOff, X, Zap,
} from 'lucide-react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import Avatar from './components/Avatar';
import {
  addCompletedWorkout, bestTime, COIN_REWARD, formatTime, getLevel,
  getLevelProgress, getRank, loadProfile, persistProfile,
  TARGET_REPS, XP_REWARD, type Profile,
} from './lib/progression';
import { getKneeAngle, SquatCounter, type CounterFeedback, type CounterSnapshot, type PosePoint } from './lib/squatCounter';
import { cameraOrientation, portraitCameraConstraints, type CameraOrientation } from './lib/camera';

type Mode = 'idle' | 'loading' | 'active' | 'complete' | 'error';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const FIRST_SNAPSHOT: CounterSnapshot = { count: 0, phase: 'calibrate', feedback: 'stand', angle: null, counted: false, calibrated: false };

const FEEDBACK: Record<CounterFeedback, string> = {
  'find-body': 'Отойди дальше: таз, колени и стопы должны быть в кадре',
  stand: 'Встань боком и выпрями ноги — начинаем закалку',
  'go-down': 'Горн зажжён. Начинай приседать',
  lower: 'Ещё глубже — доведи движение до конца',
  rise: 'Выпрями ноги. Заверши удар молота',
  great: 'Удар засчитан. Куй дальше!',
};

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Доступ к камере запрещён. Разреши камеру в настройках браузера и попробуй ещё раз.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'Камера не найдена. Подключи камеру или открой страницу на телефоне.';
  if (name === 'NotReadableError') return 'Камеру сейчас использует другое приложение. Закрой его и попробуй снова.';
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

function drawSkeleton(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, points: PosePoint[] | undefined) {
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
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.lineWidth = Math.max(3, width / 240);
  ctx.lineCap = 'round';
  const segments = [[11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
  for (const [a, b] of segments) {
    const one = points[a];
    const two = points[b];
    if (!one || !two || (one.visibility ?? 1) < 0.5 || (two.visibility ?? 1) < 0.5) continue;
    ctx.strokeStyle = '#ff9854';
    ctx.beginPath();
    ctx.moveTo(one.x * width, one.y * height);
    ctx.lineTo(two.x * width, two.y * height);
    ctx.stroke();
  }
  for (const index of [11, 12, 23, 24, 25, 26, 27, 28]) {
    const point = points[index];
    if (!point || (point.visibility ?? 1) < 0.5) continue;
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
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [mode, setMode] = useState<Mode>('idle');
  const [snapshot, setSnapshot] = useState<CounterSnapshot>(FIRST_SNAPSHOT);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState('');
  const [lastResultMs, setLastResultMs] = useState<number | null>(null);
  const [section, setSection] = useState('dashboard');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [videoOrientation, setVideoOrientation] = useState<CameraOrientation>('unknown');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const frameRef = useRef<number | null>(null);
  const counterRef = useRef(new SquatCounter());
  const startedAtRef = useRef<number | null>(null);
  const aliveRef = useRef(false);
  const requestIdRef = useRef(0);
  const lastInferenceAtRef = useRef(0);

  useEffect(() => persistProfile(profile), [profile]);

  const stopCapture = useCallback(() => {
    aliveRef.current = false;
    requestIdRef.current++;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

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
    startedAtRef.current = null;
    setElapsedMs(0);
    setSnapshot(FIRST_SNAPSHOT);
    setLastResultMs(null);
    setVideoOrientation('unknown');
    setError('');
    setMode('idle');
  }, [stopCapture]);

  const start = useCallback(async () => {
    stopCapture();
    counterRef.current.reset();
    startedAtRef.current = null;
    lastInferenceAtRef.current = 0;
    setSnapshot(FIRST_SNAPSHOT);
    setElapsedMs(0);
    setLastResultMs(null);
    setVideoOrientation('unknown');
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

    setMode('loading');
    const requestId = requestIdRef.current;
    let stream: MediaStream | null = null;
    let landmarker: PoseLandmarker | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia(portraitCameraConstraints());
      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (requestId !== requestIdRef.current) return;
          stopCapture();
          setError('Камера отключилась во время испытания. Проверь её и начни заново.');
          setMode('error');
        }, { once: true });
      }
      const video = videoRef.current;
      if (!video) throw new Error('Не найден видеоплеер');
      video.srcObject = stream;
      await video.play();
      setVideoOrientation(cameraOrientation(video.videoWidth, video.videoHeight));

      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      const sharedOptions = {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: 'VIDEO' as const,
        numPoses: 1,
        minPoseDetectionConfidence: 0.65,
        minPosePresenceConfidence: 0.65,
        minTrackingConfidence: 0.65,
      };
      try {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          ...sharedOptions,
          baseOptions: { ...sharedOptions.baseOptions, delegate: 'GPU' },
        });
      } catch {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          ...sharedOptions,
          baseOptions: { ...sharedOptions.baseOptions, delegate: 'CPU' },
        });
      }
      if (requestId !== requestIdRef.current) {
        landmarker.close();
        return;
      }
      landmarkerRef.current = landmarker;
      aliveRef.current = true;
      setMode('active');

      const scan = (time: number) => {
        if (!aliveRef.current || !landmarkerRef.current || !videoRef.current) return;
        const liveVideo = videoRef.current;
        if (liveVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && time - lastInferenceAtRef.current >= 90) {
          lastInferenceAtRef.current = time;
          try {
            const result = landmarkerRef.current.detectForVideo(liveVideo, time);
            const points = result.landmarks[0] as PosePoint[] | undefined;
            drawSkeleton(canvasRef.current, liveVideo, points);
            const angle = getKneeAngle(points ?? []);
            const next = counterRef.current.update(angle, time);
            setSnapshot(next);
            if (next.counted && soundEnabled) playRepCue(audioRef.current, next.count >= TARGET_REPS);
            if (next.calibrated && startedAtRef.current === null) startedAtRef.current = time;
            if (next.count >= TARGET_REPS) {
              const durationMs = Math.max(1, time - (startedAtRef.current ?? time));
              setElapsedMs(durationMs);
              setLastResultMs(durationMs);
              setProfile((previous) => addCompletedWorkout(previous, durationMs));
              stopCapture();
              setMode('complete');
              return;
            }
          } catch (failure) {
            setError(cameraErrorMessage(failure));
            stopCapture();
            setMode('error');
            return;
          }
        }
        frameRef.current = requestAnimationFrame(scan);
      };
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
  }, [stopCapture, soundEnabled]);

  const level = getLevel(profile.xp);
  const levelPercent = Math.round(getLevelProgress(profile.xp) * 100);
  const best = useMemo(() => bestTime(profile.workouts), [profile.workouts]);
  const repetitionsDone = profile.workouts.length * TARGET_REPS;
  const workoutCount = profile.workouts.length;
  const isCameraShown = mode === 'loading' || mode === 'active';
  const displayTime = mode === 'complete' ? (lastResultMs ?? 0) : elapsedMs;

  function navigate(id: string) {
    setSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-section-label">НАВИГАЦИЯ КУЗНИ</div>
        <nav className="nav-items" aria-label="Навигация">
          <button className={`nav-item${section === 'dashboard' ? ' selected' : ''}`} onClick={() => navigate('dashboard')}><Activity size={19} /> <span>Горн</span><span className="nav-selected-dot" /></button>
          <button className={`nav-item${section === 'challenge' ? ' selected' : ''}`} onClick={() => navigate('challenge')}><Target size={19} /> <span>Испытание</span><span className="nav-selected-dot" /></button>
          <button className={`nav-item${section === 'progress' ? ' selected' : ''}`} onClick={() => navigate('progress')}><TrendingUp size={19} /> <span>Летопись</span><span className="nav-selected-dot" /></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-quote"><div className="quote-mark"><Hammer size={30} /></div><p>ЖАР<br /><span>ПРЕВРАЩАЕТ</span><br />ЖЕЛЕЗО В СИЛУ.</p><div className="quote-line" /></div>
          <div className="sidebar-version"><span className="online-dot" /> BODYFORGE / FORGE 01 <span>v0.2</span></div>
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
              <div className="character-header"><div><div className="character-subtitle">ВЫКОВАНО ТВОИМИ УСИЛИЯМИ</div><h2>СТАЛЬНОЙ <span>БОЕЦ</span></h2></div><span className="character-level">LVL <strong>{String(level).padStart(2, '0')}</strong></span></div>
              <div className="avatar-stage">
                <div className="forge-furnace" aria-hidden="true" /><div className="arena-dashes" aria-hidden="true">BODY<span>FORGE</span></div>
                <div className="stage-cross left" aria-hidden="true">+</div><div className="stage-cross right" aria-hidden="true">+</div>
                <Avatar workouts={workoutCount} />
                <div className="power-label"><span className="online-dot" /><strong>ЗАКАЛКА</strong><span>{Math.min(workoutCount, 4)}/4</span></div>
              </div>
              <div className="character-footer">
                <div className="xp-heading"><span><Hammer size={16} /> ПРОЧНОСТЬ / XP</span><strong>{profile.xp % 250} <small>/ 250 XP</small></strong></div>
                <div className="xp-track"><div className="xp-progress" style={{ width: `${levelPercent}%` }} /></div>
                <div className="xp-foot"><span>УРОВЕНЬ {level}</span><span>ДО НОВОЙ ЗАКАЛКИ: {250 - (profile.xp % 250)} XP</span></div>
              </div>
            </article>

            <article className={`challenge-card${isCameraShown ? ' challenge-card-live' : ''}`} id="challenge">
              <div className="card-topline"><span className="section-index">02 / ИСПЫТАНИЕ ГОРНА</span><span className={`tag ${mode === 'active' ? 'live-tag' : 'lime-tag'}`}><span className="tag-dot" /> {mode === 'active' ? 'ИДЁТ ТРЕНИРОВКА' : mode === 'complete' ? 'ВЫПОЛНЕНО' : 'ДОСТУПНО'}</span></div>
              <div className="challenge-heading"><div><div className="challenge-type"><Hammer size={16} /> ЗАКАЛКА №01 / СИЛА НОГ</div><h2>20 <span>ПРИСЕДАНИЙ</span></h2><p>Двадцать ударов по своей слабости. Камера следит за каждым полным движением и останавливает испытание автоматически.</p></div></div>

              <div className={`training-visual${isCameraShown ? ' training-visual-camera' : ''}${mode === 'complete' ? ' training-visual-done' : ''}`} data-camera-format="9:16">
                <div className="portrait-frame-label"><span><Smartphone size={13} /> ВЕРТИКАЛЬНЫЙ КАДР / 9:16</span><span>{mode === 'active' ? formatTime(elapsedMs) : 'FORGE CAM · 01'}</span></div>
                <video ref={videoRef} className={`camera-feed${isCameraShown ? ' camera-visible' : ''}`} playsInline muted autoPlay aria-label="Вертикальное окно видеозахвата для отслеживания приседаний" />
                <canvas ref={canvasRef} className={`pose-overlay${isCameraShown ? ' pose-visible' : ''}`} aria-hidden="true" />
                {!isCameraShown && mode !== 'complete' && <div className="scan-backdrop" aria-hidden="true"><div className="scan-corners"><Hammer size={74} strokeWidth={1.1} /></div><div className="scan-circle" /><div className="scan-instruction">РАЗМЕСТИ ТЕЛО В ВЕРТИКАЛЬНОМ КАДРЕ</div></div>}
                {mode === 'loading' && <div className="loading-overlay"><div className="spinner" /><strong>НАСТРАИВАЕМ КАМЕРУ</strong><span>Загружаем модель распознавания позы…</span></div>}
                {mode === 'complete' ? (
                  <div className="completion-stage"><div className="completion-medal"><Trophy size={42} /></div><strong>ЗАКАЛКА ЗАВЕРШЕНА!</strong><span>20 ЗАСЧИТАННЫХ ПОВТОРЕНИЙ</span><div className="completion-rewards"><div><Zap size={18} /> +{XP_REWARD} XP</div><div><Coins size={18} /> +{COIN_REWARD}</div></div></div>
                ) : (
                  <div className="counter-center"><CounterCircle count={snapshot.count} active={mode === 'active'} /></div>
                )}
                {mode === 'active' && <div className="camera-corner-tag"><span className="record-dot" /> ЗАХВАТ ДВИЖЕНИЯ / LIVE</div>}
              </div>

              <div className="live-feedback" aria-live="polite">
                {mode === 'active' ? <><span className={snapshot.angle === null ? 'feedback-dot warning' : 'feedback-dot'} /><span>{FEEDBACK[snapshot.feedback]}</span><strong>{snapshot.angle === null ? '—' : `${snapshot.angle}°`}</strong></>
                  : mode === 'loading' ? <><div className="feedback-dot warning" /><span>Разреши доступ к камере и дождись загрузки.</span></>
                    : mode === 'complete' ? <><Check size={17} className="feedback-success" /><span>Всё засчитано. Герой стал сильнее!</span></>
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
              {mode === 'idle' && <button className="primary-button" onClick={start}><Hammer size={20} /> НАЧАТЬ ЗАКАЛКУ <ArrowRight size={20} /></button>}
              {mode === 'loading' && <button className="secondary-button" onClick={cancel}><X size={18} /> ОТМЕНИТЬ ЗАПУСК</button>}
              {mode === 'active' && <button className="secondary-button" onClick={cancel}><CameraOff size={18} /> ЗАВЕРШИТЬ БЕЗ НАГРАДЫ</button>}
              {mode === 'error' && <button className="primary-button" onClick={start}><RotateCcw size={19} /> РАЗЖЕЧЬ ГОРН СНОВА <ArrowRight size={19} /></button>}
              {mode === 'complete' && <button className="primary-button" onClick={start}><RotateCcw size={19} /> НОВАЯ ЗАКАЛКА <ArrowRight size={19} /></button>}
              <div className="challenge-footnote"><ShieldCheck size={14} /> ВИДЕО ОБРАБАТЫВАЕТСЯ НА ТВОЁМ УСТРОЙСТВЕ · НЕ ЗАПИСЫВАЕТСЯ</div>
            </article>
          </section>

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
      <nav className="mobile-nav" aria-label="Мобильная навигация"><button onClick={() => navigate('dashboard')} className={section === 'dashboard' ? 'active' : ''}><Activity size={21} /><span>ГОРН</span></button><button onClick={() => navigate('challenge')} className={section === 'challenge' ? 'active' : ''}><Play size={21} /><span>ТРЕНИРОВКА</span></button><button onClick={() => navigate('progress')} className={section === 'progress' ? 'active' : ''}><TrendingUp size={21} /><span>ЛЕТОПИСЬ</span></button></nav>
      <div className="screen-grain" aria-hidden="true" />
      <div className="sr-only" aria-live="polite">{mode === 'complete' ? 'Тренировка окончена. Вы получили опыт и монеты.' : ''}</div>
    </div>
  );
}

export default App;
