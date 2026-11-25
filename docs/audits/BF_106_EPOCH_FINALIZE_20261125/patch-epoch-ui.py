from pathlib import Path
from hashlib import sha256
p=Path('src/hooks/useProfileStorage.ts')
a=Path('docs/audits/BF_106_EPOCH_FINALIZE_20261125')
old=p.read_bytes()
assert sha256(old).hexdigest()=='1d6aaf3d448159160a4d8460b058414709293855244cec0ded6629b0efbf3c99'
s=old.decode('utf-8').replace('\r\n','\n')
def once(x,y):
 global s
 assert s.count(x)==1,x
 s=s.replace(x,y)
once("import { withProfileWriteLock, type ProfileWriteIssue } from '../lib/profileLock';","import { withProfileWriteLock, type ProfileWriteIssue } from '../lib/profileLock';\nimport { PROFILE_EPOCH_KEY, readProfileEpoch } from '../lib/profileEpoch';")
once("const uiStatus = (state: ProfileLoadResult): StorageStatus => state.status === 'empty' ? 'ready' : state.status;","""const uiStatus = (state: ProfileLoadResult): StorageStatus => state.status === 'empty' ? 'ready' : state.status;
function observedEpoch(): string | null | undefined {
  try { return readProfileEpoch(); } catch { return undefined; }
}""")
once("  const [initial] = useState(loadProfileState);","""  const [{ state: initial, epoch: initialEpoch }] = useState(() => {
    const before = observedEpoch();
    const state = loadProfileState();
    const after = observedEpoch();
    return { state: before === after && after !== undefined ? state :
      { ...state, status: 'unavailable' as const }, epoch: before === after ? after : undefined };
  });""")
once("  const revision = useRef(initial.revision);","""  const revision = useRef(initial.revision);
  // Wallet bytes alone do not identify an imported generation (ABA).
  const epochRevision = useRef(initialEpoch);
  const epochIssue = useCallback((): 'conflict' | 'unavailable' | null => {
    const current = observedEpoch();
    return current === undefined ? 'unavailable' : current !== epochRevision.current ? 'conflict' : null;
  }, []);""")
once("    setWriteIssue(null);\n    if (retry) {","""    setWriteIssue(null);
    const lineageIssue = epochIssue();
    if (lineageIssue) { setStatus(lineageIssue); return; }
    if (retry) {""")
once("  }), [runWrite]);\n\n  useEffect(() => {","  }), [runWrite, epochIssue]);\n\n  useEffect(() => {")
once("          if (localStorage.getItem(STORAGE_KEY) === revision.current) return;\n          issue = 'conflict';","""          const lineageIssue = epochIssue();
          if (!lineageIssue && localStorage.getItem(STORAGE_KEY) === revision.current) return;
          issue = lineageIssue ?? 'conflict';""")
once("if (event.key === STORAGE_KEY || event.key === PROFILE_REPLACEMENT_MARKER_KEY || event.key === null) inspect();","if (event.key === STORAGE_KEY || event.key === PROFILE_REPLACEMENT_MARKER_KEY || event.key === PROFILE_EPOCH_KEY || event.key === null) inspect();")
once("  }, [cancelPending]);\n\n  const accept", "  }, [cancelPending, epochIssue]);\n\n  const accept")
once("    setStatus(uiStatus(state));\n    // A recovery view", """    const epoch = observedEpoch();
    setStatus(epoch === undefined ? 'unavailable' : uiStatus(state));
    // A recovery view""")
once("    if (state.status !== 'unavailable') revision.current = state.revision;","""    if (state.status !== 'unavailable' && epoch !== undefined) {
      revision.current = state.revision;
      epochRevision.current = epoch;
    }""")
once("      const queued = runWrite(async (context) => {\n        const foreground", """      const queued = runWrite(async (context) => {
        // An already finished result still owns its independent durable stage.
        // Without a result, a stale tab must explicitly reload before replay.
        const lineageIssue = epochIssue();
        if (lineageIssue && !volatileResult.current) { setStatus(lineageIssue); return; }
        const foreground""")
once("  }, [applyJournal, runWrite, canContinue]);","  }, [applyJournal, runWrite, canContinue, epochIssue]);")
once("            if (current.revision !== revision.current) {\n              setStatus('conflict');","""            const lineageIssue = epochIssue();
            if (lineageIssue || current.revision !== revision.current) {
              setStatus(lineageIssue ?? 'conflict');""")
once("  }, [reconcileToken, replay]);","  }, [reconcileToken, replay, epochIssue]);")
once("      if (loadProfileState().revision !== revision.current) { setStatus('conflict'); return null; }","""      const lineageIssue = epochIssue();
      if (lineageIssue || loadProfileState().revision !== revision.current) { setStatus(lineageIssue ?? 'conflict'); return null; }""")
once("  }, [accept, applyJournal, runWrite]);","  }, [accept, applyJournal, runWrite, epochIssue]);")
# Explicit recovery must not mutate an unseen generation; quarantine remains
# identity-bound and is already an explicit recovery action.
once("      const state = recoverProfile(source);","""      const lineageIssue = epochIssue();
      if (lineageIssue) { setStatus(lineageIssue); return; }
      const state = recoverProfile(source);""")
once("  }, [accept, applyJournal, runWrite, stageBeforeRecovery]);","  }, [accept, applyJournal, runWrite, stageBeforeRecovery, epochIssue]);")
with (a/'useProfileStorage.ts.before-epoch-ui-fix').open('xb') as f:f.write(old)
assert p.read_bytes()==old
p.write_bytes(s.encode('utf-8'))
print('PATCH',p.stat().st_size,sha256(p.read_bytes()).hexdigest())