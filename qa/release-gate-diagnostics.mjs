// Typed, bounded diagnostics for the owned-browser integration gate.
// Never retain arbitrary child output, profile names, endpoints, or stack traces.
const stages=new Set(['launch-first','launch-second','verify-distinct','recover-first','verify-recovery','verify-second','close-second','verify-final']);
const reasons=new Set(['assertion','launcher','identity','native-recovery','cdp-transport','profile-removal','unclassified']);
export function recoveryFailureCode(error){
  if(error?.code==='ERR_ASSERTION')return 'assertion';
  const m=typeof error?.message==='string'?error.message:'';
  if(/launcher|spawn|launch failed/i.test(m))return 'launcher';
  if(/identity|endpoint|profile link|profile changed|profile mismatch/i.test(m))return 'identity';
  if(/Windows recovery|Windows profile recovery|owned termination|owned processes remain/i.test(m))return 'native-recovery';
  if(/profile removal/i.test(m))return 'profile-removal';
  if(/CDP|fetch failed|timeout|HTTP|DevTools|aborted/i.test(m))return 'cdp-transport';
  return 'unclassified';
}
const cleanupStages=new Set(["bind","identity","cdp-close","launcher-wait","post-close-identity","native-recovery","launcher-exit","debug-port","profile-removal"]);
const cleanupCodes=new Set(["identity","launcher","native-recovery","cdp-transport","profile-removal","debug-port","unclassified",
  "native-timeout","native-scope-uninspectable","native-scope-ambiguous","native-creation-mismatch","native-image-mismatch","native-image-unavailable","native-wait-unavailable",
  "native-handle","native-termination","native-exit","native-remaining","native-count","native-other","native-receipt"]);
export function cleanupFailureCode(stage,error){
  if(cleanupCodes.has(error?.cleanupCode))return error.cleanupCode;
  if(error?.name==="OwnershipError")return "identity";
  if(stage==="debug-port")return "debug-port";
  if(stage==="profile-removal"&&error?.name!=="OwnershipError")return "profile-removal";
  const code=recoveryFailureCode(error);
  return cleanupCodes.has(code)?code:"unclassified";
}
export function createRecoveryDiagnostics(){
  let stage, failure, screenFailure, cleanupFailure, cleanupUnverified=false;
  function line(raw){
    const value=raw.endsWith('\r')?raw.slice(0,-1):raw;
    const prefix='BF005_RECOVERY_STAGE ';
    if(value.startsWith(prefix)){
      const s=value.slice(prefix.length);if(stages.has(s))stage=s;
      return;
    }
    const match=/^BF005_RECOVERY_FAILURE ([a-z-]+) ([a-z-]+)$/.exec(value);
    if(match&&stages.has(match[1])&&reasons.has(match[2])&&!failure)
      failure={stage:match[1],code:match[2]};
    const screen=/^BF_SCREEN_OWNERSHIP_DIAGNOSTIC ([a-z-]+) ([a-z-]+)$/.exec(value);
    if(screen&&['preflight','browser','fresh','create','responsive','shortcuts','complete'].includes(screen[1])&&reasons.has(screen[2])&&!screenFailure)
      screenFailure={stage:screen[1],code:screen[2]};
    if(value==='BF005_RECOVERY_CLEANUP_UNVERIFIED')cleanupUnverified=true;
    const cleanup=/^QA_OWNED_CLEANUP_FAILURE ([a-z-]+) ([a-z-]+)$/.exec(value);
    if(cleanup&&cleanupStages.has(cleanup[1])&&cleanupCodes.has(cleanup[2])&&!cleanupFailure)
      cleanupFailure={stage:cleanup[1],code:cleanup[2]};
  }
  return {
    // Separate framing for stdout and stderr, including partial UTF-8/CRLF chunks.
    stream(){
      let buffer='',discard=false;
      return {
        push(chunk){
          for(const c of String(chunk)){
            if(c==='\n'){
              if(!discard)line(buffer);
              buffer='';discard=false;
            }else if(!discard){
              if(buffer.length<256)buffer+=c;
              else{buffer='';discard=true;}
            }
          }
        },
        end(){if(!discard&&buffer)line(buffer);buffer='';discard=false;},
      };
    },
    snapshot(){return { ...(stage?{stage}:{}),...(failure?{failure:{...failure}}:{}),...(screenFailure?{screenFailure:{...screenFailure}}:{}),...(cleanupFailure?{cleanupFailure:{...cleanupFailure}}:{}),cleanupUnverified };},
  };
}
