import { Camera, CameraIcon, RefreshCw, Scan, ZoomIn } from 'lucide-react';
import type { CameraDeviceOption, CameraSource, CameraZoom, CameraSelectionVerification } from '../lib/camera';

interface CameraControlsProps {
  source: CameraSource;
  verification: CameraSelectionVerification;
  devices: CameraDeviceOption[];
  zoom: CameraZoom | null;
  active: boolean;
  busy: boolean;
  message: string;
  fullFrame: boolean;
  onToggleFullFrame: () => void;
  onChoose: (source: CameraSource) => void;
  onRefresh: () => void;
  onZoom: (value: number) => void;
}

const same = (a: CameraSource, b: CameraSource) => a.kind === b.kind && a.value === b.value;

export default function CameraControls({
  source, verification, devices, zoom, active, busy, message, fullFrame, onToggleFullFrame,
  onChoose, onRefresh, onZoom,
}: CameraControlsProps) {
  const wide = devices.find((camera) => camera.ultraWide);
  const main = devices.find((camera) =>
    !camera.ultraWide && /back|rear|environment|задн|основн/i.test(camera.label));
  const mismatch = active && verification === 'mismatch';
  const selectedWide = !mismatch && ((source.kind === 'device' && source.value === wide?.deviceId) ||
    Boolean(active && zoom && zoom.current < .92 && (source.kind !== 'facing' || source.value === 'environment')));
  const canOpticalWide = Boolean(active && zoom && zoom.min < .95 &&
    (source.kind !== 'facing' || source.value === 'environment'));
  const wideAvailable = Boolean(wide || canOpticalWide);
  const selectedFront = !mismatch && same(source, { kind: 'facing', value: 'user' });
  const selectedMain = !mismatch && !selectedWide && (
    same(source, { kind: 'facing', value: 'environment' }) ||
    (source.kind === 'device' && source.value === main?.deviceId)
  );
  const canChange = !busy;

  return (
    <div className="camera-control-deck" aria-label="Настройки камеры"
      data-camera-source-verification={active ? verification : 'idle'}>
      <div className="camera-control-header">
        <div><Camera size={18}/><strong>ОБЪЕКТИВ КАМЕРЫ</strong></div>
        <button type="button" className="camera-refresh" onClick={onRefresh}
          disabled={busy} aria-label="Обновить список камер" title="Проверить доступные камеры">
          <RefreshCw size={15} /> ОБНОВИТЬ
        </button>
      </div>
      <div className="camera-lenses" role="group" aria-label="Выбор объектива">
        <button type="button" className={selectedFront ? 'selected' : ''}
          disabled={!canChange} aria-pressed={selectedFront}
          onClick={() => onChoose({ kind: 'facing', value: 'user' })}>
          <Camera size={19}/><strong>СЕЛФИ</strong><small>Передняя</small>
        </button>
        <button type="button" className={selectedMain ? 'selected' : ''}
          disabled={!canChange} aria-pressed={selectedMain}
          onClick={() => onChoose(main ? { kind: 'device', value: main.deviceId } : { kind: 'facing', value: 'environment' })}>
          <CameraIcon size={19}/><strong>ОСНОВНАЯ</strong><small>1× / задняя</small>
        </button>
        <button type="button" className={selectedWide ? 'selected' : ''}
          disabled={!canChange || !wideAvailable} aria-pressed={selectedWide}
          onClick={() => wide ? onChoose({ kind: 'device', value: wide.deviceId }) : zoom && onZoom(zoom.min)}>
          <Scan size={19}/><strong>ШИРОКАЯ</strong><small>{wide ? 'Широкий объектив' : canOpticalWide && zoom ? `От ${zoom.min.toFixed(1)}×` : 'НЕТ ДОСТУПА'}</small>
        </button>
      </div>
      {devices.length > 0 && (
        <label className="camera-source-select">
          <span>ОБНАРУЖЕННЫЕ КАМЕРЫ</span>
          <select value={!mismatch && source.kind === 'device' ? source.value : ''} disabled={!canChange}
            onChange={(event) => {
              const id = event.target.value;
              onChoose(id ? { kind: 'device', value: id } : { kind: 'facing', value: 'environment' });
            }}>
            <option value="">По умолчанию</option>
            {devices.map((camera) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.ultraWide ? 'Широкий · ' : ''}{camera.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {active && zoom && (
        <label className="camera-zoom-control">
          <span><ZoomIn size={15}/> МАСШТАБ <strong>{zoom.current.toFixed(1)}×</strong></span>
          <input aria-label="Масштаб камеры" type="range" min={zoom.min}
            max={zoom.max} step={zoom.step} value={zoom.current}
            disabled={busy} onChange={(event) => onZoom(Number(event.target.value))}/>
          <small>{zoom.min.toFixed(1)}× <span>{zoom.max.toFixed(1)}×</span></small>
        </label>
      )}
      <button type="button" className={`camera-frame-toggle${fullFrame ? ' selected' : ''}`}
        aria-pressed={fullFrame} onClick={onToggleFullFrame}>
        <Scan size={15}/> {fullFrame ? 'ПОКАЗАН ВЕСЬ КАДР' : 'ПОКАЗАТЬ ВЕСЬ КАДР'}
        <small>{fullFrame ? 'Без обрезки' : 'Края не обрезаются'}</small>
      </button>
      <p className="camera-control-help" role="status">
        {message || (wideAvailable
          ? 'Браузер предлагает широкий объектив или уменьшение масштаба. Это не гарантирует оптический зум 0.5×. Кадр остаётся 9:16.'
          : 'Широкая 0.5× появляется, только если браузер видит этот объектив или поддерживает зум меньше 1×.')}
      </p>
    </div>
  );
}
