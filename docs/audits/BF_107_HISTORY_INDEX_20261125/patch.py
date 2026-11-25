from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_107_HISTORY_INDEX_20261125')
p=Path('src/lib/progressPulse.ts')
q=Path('src/components/ProgressPulseBoard.tsx')
expected={p:'8f68b7b4f7d9c385c1d92ce1fcc088212b3f7ed06b058113ed8dd25b67dce61d',q:'50863efd9d27fff3bfcd3abba94198dbf16dc4cca7509526db2eee203a58d882'}
orig={f:f.read_bytes() for f in expected}
for f,h in expected.items(): assert sha256(orig[f]).hexdigest()==h,f
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
s=orig[p].decode('utf-8').replace('\r\n','\n')
s=once(s,'export type PulseRange = 7 | 30;', "export type ActivityRecord = Pick<Workout, 'id' | 'finishedAt' | 'repetitions' | 'exerciseId' | 'holdSeconds'>;\nexport type PulseRange = 7 | 30;")
s=once(s,'  workouts: readonly Workout[], now: Date, range: PulseRange = 7,','  workouts: readonly ActivityRecord[], now: Date, range: PulseRange = 7,')
s=once(s,'  workouts: readonly Workout[], now: Date, range: PulseRange, recordedWorkoutCount = workouts.length,',"  workouts: readonly ActivityRecord[], now: Date, range: PulseRange, recordedWorkoutCount = workouts.length,\n  coverage?: 'complete' | 'partial',")
s=once(s,'const historyLimited = workouts.length >= 60 || recordedWorkoutCount > workouts.length;', "const historyLimited = coverage === 'partial' || recordedWorkoutCount > workouts.length ||\n    (coverage !== 'complete' && workouts.length >= 60);")
t=orig[q].decode('utf-8').replace('\r\n','\n')
t=once(t,"import { comparePulsePeriods, type PulseRange } from '../lib/progressPulse';","import { comparePulsePeriods, type PulseRange } from '../lib/progressPulse';\nimport { readActivityHistory, visibleActivityHistory, type ActivityHistoryIndex } from '../lib/activityHistory';")
t=once(t,"  const dateStrip = useRef<HTMLDivElement>(null);","""  const dateStrip = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<{ profile: Profile; value: ActivityHistoryIndex } | null>(null);
  useEffect(() => {
    if (!activityVisible || actionsDisabled) { setHistory(null); return; }
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort(); setHistory(null);
      const request = new AbortController();
      controller = request;
      void readActivityHistory(profile, request.signal).then(value => {
        if (!request.signal.aborted) setHistory({ profile, value });
      }, () => {
        if (!request.signal.aborted) setHistory({ profile, value: visibleActivityHistory(profile, true) });
      });
    };
    const visible = () => { if (!document.hidden) refresh(); };
    refresh();
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      controller?.abort();
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [profile, activityVisible, actionsDisabled]);""")
t=once(t,"  const { current: trend, previous, deltaSessions, historyLimited } =\n    comparePulsePeriods(profile.workouts, now, range,\n      Math.max(profile.totals?.workouts ?? 0, profile.creditedWorkoutIds?.length ?? 0));","""  const indexed = activityVisible && !actionsDisabled && history?.profile === profile ? history.value : null;
  const coverage = indexed ?? visibleActivityHistory(profile);
  const { current: trend, previous, deltaSessions, historyLimited } =
    comparePulsePeriods(coverage.records, now, range, coverage.expectedCount, coverage.complete ? 'complete' : 'partial');""")
t=once(t,'        data-history-limited={historyLimited}>','        data-history-limited={historyLimited} data-history-index={indexed ? "ready" : "visible"}\n        data-history-known={coverage.records.length} data-history-expected={coverage.expectedCount} data-history-restored={coverage.restoredCount}>')
t=once(t,'        <p className="pulse-data-note">{historyLimited',"""        {indexed && <p className="pulse-data-note" data-history-coverage>
          {historyLimited ? 'Известны ' + coverage.records.length + ' из как минимум ' + coverage.expectedCount + ' тренировок.'
            : 'Доступна история всех ' + coverage.records.length + ' сохранённых тренировок.'}
          {coverage.restoredCount > 0 && ' Восстановлено из сохранённых записей: ' + coverage.restoredCount + '.'}
        </p>}
        <p className="pulse-data-note">{historyLimited""")
for f,data in orig.items():
 with (a/(f.name+'.before')).open('xb') as out:out.write(data)
for f,data in orig.items(): assert f.read_bytes()==data
for f,txt in [(p,s),(q,t)]:
 f.write_bytes(txt.encode('utf-8'))
 print(f,f.stat().st_size,sha256(f.read_bytes()).hexdigest())
