// Native policy tests only: no Android SDK, packaging, device or health records.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const policy = [
  ['StepsPolicyTest', 'BODYFORGE_NATIVE_POLICY_PASS'],
  ['LiveStepPolicyTest', 'BODYFORGE_LIVE_STEPS_POLICY_PASS'],
];
export function readPolicyCount(output, marker) {
  const lines = String(output).split(/\r?\n/).filter(line => line.startsWith(marker));
  if (lines.length !== 1) throw Error('policy-marker');
  const match = lines[0].match(/^([A-Z_]+) checks=([1-9]\d*)$/);
  const count = match && match[1] === marker ? Number(match[2]) : NaN;
  if (!Number.isSafeInteger(count) || count <= 0) throw Error('policy-marker');
  return count;
}

function resolveJdk(home) {
  if (!home || !path.isAbsolute(home)) throw Error('jdk-unavailable');
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const tools = ['javac', 'java'].map(name => path.join(home, 'bin', name + suffix));
  if (tools.some(tool => !fs.existsSync(tool) || !fs.statSync(tool).isFile())) {
    throw Error('jdk-unavailable');
  }
  return tools;
}

export function verifyNativePolicies(javaHome = process.env.JAVA_HOME) {
  const [javac, java] = resolveJdk(javaHome);
  const temp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'bf-native-policy-'));
  const owned = fs.lstatSync(temp);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|JDK_JAVAC_OPTIONS|_JAVA_OPTIONS|CLASSPATH)$/i.test(key)));
  function run(binary, args, stage) {
    const child = spawnSync(binary, args, {
      cwd: root, env, shell: false, windowsHide: true, encoding: 'utf8',
      timeout: 45000, maxBuffer: 128 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (child.error || child.signal || child.status !== 0) throw Error(stage);
    return child.stdout;
  }
  try {
    const base = 'android/src/java/ru/bodyforge/healthqa/';
    run(javac, ['--release', '8', '-encoding', 'UTF-8', '-proc:none', '-classpath', temp, '-d', temp,
      base + 'StepsPolicy.java', base + 'LiveStepPolicy.java',
      ...policy.map(([name]) => 'android/tests/' + name + '.java')], 'policy-compile');
    const [dailyChecks, liveChecks] = policy.map(([name, marker]) =>
      readPolicyCount(run(java, ['-cp', temp, 'ru.bodyforge.healthqa.' + name], 'policy-run'), marker));
    return { dailyChecks, liveChecks, scope: 'source-only', packaging: 'not-run', field: 'not-run' };
  } finally {
    const current = fs.lstatSync(temp);
    if (!current.isDirectory() || current.isSymbolicLink() ||
        current.dev !== owned.dev || current.ino !== owned.ino ||
        current.birthtimeMs !== owned.birthtimeMs) throw Error('policy-cleanup');
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    if (fs.existsSync(temp)) throw Error('policy-cleanup');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw Error('invalid-arguments');
    const result = verifyNativePolicies();
    console.log('BF_NATIVE_POLICY_PASS', JSON.stringify(result));
  } catch (error) {
    const safe = new Set(['invalid-arguments', 'jdk-unavailable', 'policy-compile',
      'policy-run', 'policy-marker', 'policy-cleanup']);
    console.error('BF_NATIVE_POLICY_BLOCKED', safe.has(error?.message) ? error.message : 'local-tool-error');
    process.exitCode = 16;
  }
}
