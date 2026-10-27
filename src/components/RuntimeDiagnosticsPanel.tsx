import { useEffect, useState } from 'react';
import { runtimeDiagnostics, type DiagnosticsSnapshot } from '../lib/runtimeDiagnostics';

const fmt = (value: number | null, unit = ''): string =>
  value === null ? '—' : String(value) + unit;

/** Opt-in display. Readings stay in RAM; only a deliberate Copy action uses the clipboard. */
export default function RuntimeDiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<DiagnosticsSnapshot>(() => runtimeDiagnostics.snapshot());
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    const refresh = () => setStats(runtimeDiagnostics.snapshot());
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  async function copyReport() {
    if (!navigator.clipboard?.writeText) {
      setMessage('Автоматическое копирование недоступно. Выдели текст отчёта вручную.');
      return;
    }
    try {
      const report = JSON.stringify(runtimeDiagnostics.snapshot(), null, 2);
      await navigator.clipboard.writeText(report);
      setMessage('Показатели скопированы. Видео и данные тренировок не включены.');
    } catch {
      setMessage('Не удалось скопировать. Выдели текст отчёта вручную.');
    }
  }

  return (
    <section className="perf-panel" aria-label="Диагностика скорости приложения">
      <button type="button" className="perf-toggle" aria-expanded={open}
        onClick={() => {
          // Opening must show the latest completed load immediately, rather
          // than the empty snapshot captured before the avatar finished loading.
          if (!open) setStats(runtimeDiagnostics.snapshot());
          setOpen((value) => !value); setMessage('');
        }}>
        <span>ДИАГНОСТИКА УСТРОЙСТВА</span><span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="perf-body" data-diagnostics="open">
          <p>Замеры только в памяти этой вкладки. Никакие кадры камеры, координаты тела и личный прогресс не записываются.</p>
          <div className="perf-values">
            <div><span>MediaPipe · 95% вызовов до</span>
              <strong data-camera-p95={stats.camera.p95Ms ?? 'none'}>{fmt(stats.camera.p95Ms, ' мс')}</strong></div>
            <div><span>Распознано кадров</span>
              <strong data-camera-frames={stats.camera.frames}>{stats.camera.frames}</strong></div>
            <div><span>Обработка кадров/с</span>
              <strong>{fmt(stats.camera.observedHz, ' Гц')}</strong></div>
            <div><span>3D · кадров/с в цикле</span>
              <strong data-avatar-fps={stats.avatar.observedFps ?? 'none'}>{fmt(stats.avatar.observedFps)}</strong></div>
            <div><span>Кадров последней 3D-сцены</span>
              <strong data-avatar-frames={stats.avatar.frames} data-avatar-animating={stats.avatar.animating}>{stats.avatar.frames}</strong></div>
            <div><span>Последняя загрузка GLB</span>
              <strong data-glb-load={stats.avatar.glbLoadMs ?? 'none'}>{fmt(stats.avatar.glbLoadMs, ' мс')}</strong></div>
            <div><span>Последняя 3D-сцена: геометрии / текстуры</span>
              <strong>{fmt(stats.avatar.geometries)} / {fmt(stats.avatar.textures)}</strong></div>
          </div>
          <p className="perf-hint">Цифры приблизительные: зависят от телефона, режима энергосбережения и кэша. Частота 3D показывается только при работающем цикле; ручные повороты учитываются в числе кадров. Это частота отправки кадров рендереру, а не измерение времени GPU. Для 95-го процентиля нужно не менее 20 обработанных кадров. «—» означает паузу или недостаток измерений. Это не оценка техники приседаний.</p>
          <label className="perf-export-label" htmlFor="perf-report">Показатели устройства · JSON</label>
          <textarea id="perf-report" className="perf-export" readOnly
            aria-label="Отчёт производительности без личных данных"
            value={JSON.stringify(stats, null, 2)} rows={5}/>
          <button type="button" className="perf-copy" onClick={() => { void copyReport(); }}>СКОПИРОВАТЬ ПОКАЗАТЕЛИ</button>
          {message && <p className="perf-copy-status" role="status">{message}</p>}
        </div>
      )}
    </section>
  );
}
