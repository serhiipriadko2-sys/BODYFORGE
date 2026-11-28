import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Footprints, Settings2 } from 'lucide-react';
import { hasNativeLiveSteps, hasNativeStepsLink, NATIVE_STEPS_PATH } from '../lib/nativeSteps';
import { localDay } from '../lib/game';
import { manualStepsCopy, type ManualStepsPrompt } from '../lib/manualStepsCopy';
import { MANUAL_STEPS_KEY, MAX_MANUAL_STEPS, readManualSteps, saveManualSteps } from '../lib/stepsLog';

interface Props { now: Date; busy?: boolean }

export default function StepsBoard({ now, busy = false }: Props) {
  // Capability is a presentation hint only. Android validates the route,
  // user gesture and permission again, and never sends a step count to JS.
  const native = typeof window !== 'undefined' &&
    hasNativeStepsLink(window.location.origin, window.navigator.userAgent);
  if (!native) return <ManualStepsBoard now={now}/>;
  // Native bar owns presentation; this hidden marker carries screen/busy state only.
  if (hasNativeLiveSteps(window.location.origin, window.navigator.userAgent)) {
    return <span hidden data-native-live-panel={busy ? 'busy' : 'ready'}/>;
  }

  const content = <>
    <span className="bf-steps-trigger-icon"><Footprints size={20} aria-hidden="true"/></span>
    <span className="bf-steps-trigger-copy"><strong>Шаги</strong>
      <small>{busy ? 'После тренировки' : 'Health Connect · открыть'}</small></span>
    <ChevronRight size={18} aria-hidden="true"/>
  </>;
  return (
    <section className="forge-section bf-experience-section" id="step-log" aria-label="Шаги и синхронизация">
      {busy
        ? <button type="button" className="bf-steps-trigger bf-steps-native-action" disabled data-sync-state="busy">{content}</button>
        : <a className="bf-steps-trigger bf-steps-native-action" data-sync-state="native-action" href={NATIVE_STEPS_PATH}>{content}</a>}
    </section>
  );
}

function ManualStepsBoard({ now }: Pick<Props, 'now'>) {
  const [copy] = useState(() => manualStepsCopy(typeof navigator === 'undefined' ? undefined : navigator.language));
  const [state, setState] = useState(() => readManualSteps(now));
  const [draft, setDraft] = useState(() => ({ value: String(state.data.count), day: state.data.day }));
  const [message, setMessage] = useState<ManualStepsPrompt | null>(null);
  const day = localDay(now);
  const editor = useRef({ draft, count: state.data.count, status: state.status });
  editor.current = { draft, count: state.data.count, status: state.status };

  useEffect(() => {
    const refresh = (external = false) => {
      const next = readManualSteps(new Date());
      const sameDay = editor.current.draft.day === next.data.day;
      const dirty = editor.current.draft.value !== String(editor.current.count);
      const keepDraft = next.status !== 'date-conflict' && sameDay && dirty;
      setState(next);
      if (!keepDraft) setDraft({ value: String(next.data.count), day: next.data.day });
      if (next.status === 'date-conflict') setMessage(null);
      else if (external) setMessage(keepDraft ? 'otherTabDraft' : 'otherTabUpdated');
      else if (!sameDay && dirty) setMessage('draftDayChanged');
      else if (editor.current.status === 'date-conflict') setMessage('dateRestored');
    };
    refresh();
    const changed = (event: StorageEvent) => {
      if (event.key === MANUAL_STEPS_KEY || event.key === null) refresh(true);
    };
    window.addEventListener('storage', changed);
    // The editor can discover a clock change before App's day observer. Refresh
    // on return even if the parent still holds the same observed calendar key.
    const visible = () => { if (!document.hidden) refresh(); };
    const resumed = () => refresh();
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', resumed);
    window.addEventListener('pageshow', resumed);
    return () => {
      window.removeEventListener('storage', changed);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', resumed);
      window.removeEventListener('pageshow', resumed);
    };
  }, [day]);

  function save() {
    const savedAt = new Date();
    if (draft.day !== localDay(savedAt)) {
      const next = readManualSteps(savedAt);
      setState(next);
      setDraft({ value: String(next.data.count), day: next.data.day });
      setMessage('staleDraft');
      return;
    }
    if (!/^\d{1,6}$/.test(draft.value) || !Number.isSafeInteger(Number(draft.value)) ||
      Number(draft.value) > MAX_MANUAL_STEPS) {
      setMessage('invalidCount');
      return;
    }
    if (!saveManualSteps(savedAt, Number(draft.value))) {
      const next = readManualSteps(savedAt);
      setState(next);
      setMessage(next.status === 'date-conflict' ? 'saveConflict' : 'writeFailed');
      return;
    }
    setState({ status: 'ready', data: { version: 1, day: localDay(savedAt), count: Number(draft.value), source: 'manual' } });
    setDraft({ value: String(Number(draft.value)), day: localDay(savedAt) });
    setMessage('saved');
  }

  return (
    <section className="forge-section bf-experience-section" id="step-log" lang={copy.language} aria-label={copy.section}>
      <details className="bf-steps-disclosure">
        <summary className="bf-steps-trigger bf-steps-dashboard" data-sync-state="unavailable">
          <span className="bf-steps-metric">
            <small>{copy.today}</small><strong data-step-auto="today">—</strong><small>Health Connect</small>
          </span>
          <span className="bf-steps-metric">
            <small>{copy.session}</small><strong data-step-auto="session">—</strong><small>{copy.sensor}</small>
          </span>
          <span className="bf-steps-settings-icon" aria-label={copy.options}><Settings2 size={21} aria-hidden="true"/></span>
          <span className="bf-steps-source">{copy.source}</span>
        </summary>
        <div className="bf-steps-body bf-steps-compact-editor">
          <p className="bf-panel-description" id="bf-steps-privacy">{copy.privacy}</p>
          <div className="bf-step-summary">
            <label className="bf-step-label" htmlFor="bf-steps-today">{copy.manualToday}</label>
            <strong data-manual-steps={state.data.count}>{state.status === 'ready' ? copy.count(state.data.count) : '—'}</strong>
          </div>
          <div className="bf-step-input-row">
            <input id="bf-steps-today" inputMode="numeric" type="number" min="0" max={MAX_MANUAL_STEPS}
              value={draft.value} onChange={(event) => setDraft({ value: event.target.value, day: state.data.day })}
              readOnly={state.status === 'date-conflict'}
              aria-describedby="bf-steps-privacy" />
            <button type="button" onClick={save} disabled={state.status === 'date-conflict'}>{copy.save}</button>
          </div>
          {message && <p className="bf-trust-note" role="status">{copy.prompt(message)}</p>}
          {state.status !== 'ready' && <p className="bf-trust-note" role="alert">{state.status === 'date-conflict'
            ? copy.dateConflict(state.recordDay)
            : state.status === 'invalid' ? copy.invalidRecord : copy.readFailed}</p>}
        </div>
      </details>
    </section>
  );
}
